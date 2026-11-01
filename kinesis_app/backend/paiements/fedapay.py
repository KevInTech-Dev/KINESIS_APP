import hashlib
import hmac
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework.exceptions import APIException


class FedaPayUnavailable(APIException):
    status_code = 503
    default_detail = "Le service de paiement est momentanément indisponible."
    default_code = "fedapay_unavailable"


def _api_base_url():
    environment = settings.FEDAPAY_ENVIRONMENT
    if environment == "sandbox":
        return "https://sandbox-api.fedapay.com/v1"
    if environment == "live":
        return "https://api.fedapay.com/v1"
    raise FedaPayUnavailable("L’environnement FedaPay configuré est invalide.")


def _request_json(method, path, payload=None):
    api_key = settings.FEDAPAY_SECRET_KEY
    if not api_key:
        raise FedaPayUnavailable("La clé secrète FedaPay n’est pas configurée.")

    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        f"{_api_base_url()}{path}",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urlopen(request, timeout=15) as response:
            response_body = response.read()
    except HTTPError as error:
        raise FedaPayUnavailable(
            "FedaPay a refusé la requête. Vérifie la configuration du compte."
        ) from error
    except (TimeoutError, URLError) as error:
        raise FedaPayUnavailable(
            "FedaPay ne répond pas pour le moment. Réessaie ultérieurement."
        ) from error

    try:
        response_data = json.loads(response_body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FedaPayUnavailable("FedaPay a renvoyé une réponse invalide.") from error
    if not isinstance(response_data, dict):
        raise FedaPayUnavailable("FedaPay a renvoyé une réponse invalide.")
    return response_data


def _resource_from_response(response_data, resource_name):
    resource = response_data
    if isinstance(resource.get("data"), dict):
        resource = resource["data"]
    if isinstance(resource.get(resource_name), dict):
        resource = resource[resource_name]
    return resource


def create_transaction(payment):
    reservation = payment.reservation
    traveler = reservation.voyageur
    payload = {
        "description": f"Réservation {reservation.reference}",
        "amount": int(payment.montant),
        "currency": {"iso": "XOF"},
        "customer": {
            "email": traveler.email,
            "firstname": traveler.prenoms or traveler.nom,
            "lastname": traveler.nom,
        },
        "custom_metadata": {
            "kinesis_payment_id": str(payment.pk),
            "reservation_reference": reservation.reference,
        },
    }
    if settings.FEDAPAY_ENVIRONMENT == "sandbox":
        payload["mode"] = "momo_test"
    if settings.FEDAPAY_CALLBACK_URL:
        callback_parts = urlsplit(settings.FEDAPAY_CALLBACK_URL)
        callback_query = [
            (key, value)
            for key, value in parse_qsl(callback_parts.query)
            if key != "payment_id"
        ]
        callback_query.append(("payment_id", str(payment.pk)))
        payload["callback_url"] = urlunsplit(
            callback_parts._replace(query=urlencode(callback_query))
        )

    response_data = _request_json("POST", "/transactions", payload)
    transaction = _resource_from_response(response_data, "transaction")
    transaction_id = transaction.get("id")
    amount = transaction.get("amount")
    if (
        transaction_id is None
        or isinstance(transaction_id, bool)
        or not str(transaction_id).isdecimal()
    ):
        raise FedaPayUnavailable(
            "La réponse FedaPay ne contient pas l’identifiant de transaction."
        )
    if amount is not None and str(amount) != str(int(payment.montant)):
        raise FedaPayUnavailable(
            "Le montant de transaction renvoyé par FedaPay est inattendu."
        )
    return str(transaction_id)


def create_payment_link(transaction_id):
    safe_id = quote(str(transaction_id), safe="")
    response_data = _request_json(
        "POST",
        f"/transactions/{safe_id}/token",
    )
    token_data = _resource_from_response(response_data, "token")
    payment_url = token_data.get("url")
    if not isinstance(payment_url, str) or not payment_url.startswith("https://"):
        raise FedaPayUnavailable(
            "La réponse FedaPay ne contient pas de lien de paiement sécurisé."
        )
    return payment_url


def retrieve_transaction(transaction_id):
    safe_id = quote(str(transaction_id), safe="")
    response_data = _request_json("GET", f"/transactions/{safe_id}")
    transaction = _resource_from_response(response_data, "transaction")
    if str(transaction.get("id")) != str(transaction_id):
        raise FedaPayUnavailable(
            "La transaction renvoyée par FedaPay ne correspond pas à la demande."
        )
    return transaction


def verify_webhook_signature(raw_body, signature_header, *, now=None):
    endpoint_secret = settings.FEDAPAY_WEBHOOK_SECRET
    if not endpoint_secret:
        raise FedaPayUnavailable("Le secret du webhook FedaPay n’est pas configuré.")

    timestamp_text = None
    signatures = []
    for item in signature_header.split(","):
        key, separator, value = item.partition("=")
        if not separator:
            continue
        if key == "t":
            timestamp_text = value
        elif key == "s":
            signatures.append(value)

    try:
        timestamp = int(timestamp_text)
    except (TypeError, ValueError):
        raise ValueError("En-tête de signature invalide.") from None

    signed_payload = str(timestamp).encode("ascii") + b"." + raw_body
    expected_signature = hmac.new(
        endpoint_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    if not any(
        hmac.compare_digest(expected_signature, candidate) for candidate in signatures
    ):
        raise ValueError("Signature webhook invalide.")

    current_time = time.time() if now is None else now
    if abs(current_time - timestamp) > 300:
        raise ValueError("Signature webhook expirée.")
