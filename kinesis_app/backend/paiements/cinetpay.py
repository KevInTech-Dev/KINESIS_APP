import hashlib
import hmac
import json
import logging
import time
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)

_access_token = None
_access_token_fingerprint = None
_access_token_expires_at = 0.0
_access_token_lock = Lock()


class CinetPayUnavailable(APIException):
    status_code = 503
    default_detail = "Le service CinetPay est momentanément indisponible."
    default_code = "cinetpay_unavailable"


def _base_url():
    return settings.CINETPAY_API_BASE_URL.rstrip("/")


def _validate_configuration(*, require_notify_url=False):
    if not settings.CINETPAY_API_KEY or not settings.CINETPAY_API_PASSWORD:
        raise CinetPayUnavailable(
            "Les identifiants API CinetPay ne sont pas configurés."
        )
    base_url = urlsplit(_base_url())
    if base_url.scheme != "https" or not base_url.netloc:
        raise CinetPayUnavailable(
            "L’adresse de l’API CinetPay doit être une URL HTTPS valide."
        )
    if require_notify_url:
        notify_url = settings.CINETPAY_NOTIFY_URL
        parts = urlsplit(notify_url)
        if (
            parts.scheme != "https"
            or not parts.netloc
            or len(notify_url) > 120
        ):
            raise CinetPayUnavailable(
                "L’URL de notification CinetPay doit être publique, HTTPS "
                "et limitée à 120 caractères."
            )


def validate_configuration(*, require_notify_url=False):
    _validate_configuration(require_notify_url=require_notify_url)


def _send_json(method, endpoint, payload=None, access_token=None):
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    request = Request(
        f"{_base_url()}{endpoint}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=15) as response:
            response_body = response.read()
    except HTTPError as error:
        error_body = error.read()
        try:
            error_response = json.loads(error_body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            error_response = {}
        response_json_valid = isinstance(error_response, dict)
        if not isinstance(error_response, dict):
            error_response = {}
        provider_code = error_response.get("code", error_response.get("error_code"))
        provider_status = error_response.get("status")
        provider_message = (
            error_response.get("message")
            or error_response.get("error_description")
            or error_response.get("detail")
            or error_response.get("error")
        )
        diagnostic_parts = []
        if error.headers:
            diagnostic_parts.append(
                f"content_type={error.headers.get_content_type()}"
            )
        if error_body:
            diagnostic_parts.append(
                f"response_bytes={len(error_body)}"
            )
            if not response_json_valid:
                diagnostic_parts.append("response_json=invalid")
        else:
            diagnostic_parts.append("response_body=empty")
        if provider_code is not None:
            diagnostic_parts.append(f"provider_code={str(provider_code)[:40]}")
        if isinstance(provider_status, str):
            diagnostic_parts.append(
                f"provider_status={provider_status[:40]}"
            )
        if isinstance(provider_message, str):
            message = " ".join(provider_message.split())[:240]
            for secret in (
                settings.CINETPAY_API_KEY,
                settings.CINETPAY_API_PASSWORD,
            ):
                if secret:
                    message = message.replace(secret, "[redacted]")
            diagnostic_parts.append(f"provider_message={message!r}")
        diagnostic = (
            f"; {'; '.join(diagnostic_parts)}" if diagnostic_parts else ""
        )
        logger.warning(
            "CinetPay rejected %s %s with HTTP %s%s.",
            method,
            endpoint,
            error.code,
            diagnostic,
        )
        raise CinetPayUnavailable(
            f"CinetPay a refusé la requête (HTTP {error.code})."
        ) from error
    except (TimeoutError, URLError) as error:
        logger.warning("CinetPay request failed for %s %s.", method, endpoint)
        raise CinetPayUnavailable(
            "CinetPay ne répond pas pour le moment. Réessayez ultérieurement."
        ) from error

    try:
        response_data = json.loads(response_body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CinetPayUnavailable(
            "CinetPay a renvoyé une réponse JSON illisible."
        ) from error
    if not isinstance(response_data, dict):
        raise CinetPayUnavailable("CinetPay a renvoyé une réponse invalide.")
    return response_data


def _credentials_fingerprint():
    credential_data = "\0".join(
        (
            _base_url(),
            settings.CINETPAY_API_KEY,
            settings.CINETPAY_API_PASSWORD,
        )
    )
    return hashlib.sha256(credential_data.encode("utf-8")).digest()


def _get_access_token():
    global _access_token
    global _access_token_expires_at
    global _access_token_fingerprint

    fingerprint = _credentials_fingerprint()
    if (
        _access_token
        and _access_token_fingerprint == fingerprint
        and time.monotonic() < _access_token_expires_at
    ):
        return _access_token

    with _access_token_lock:
        if (
            _access_token
            and _access_token_fingerprint == fingerprint
            and time.monotonic() < _access_token_expires_at
        ):
            return _access_token

        response_data = _send_json(
            "POST",
            "/v1/oauth/login",
            {
                "api_key": settings.CINETPAY_API_KEY,
                "api_password": settings.CINETPAY_API_PASSWORD,
            },
        )
        token = response_data.get("access_token")
        try:
            expires_in = int(response_data["expires_in"])
        except (KeyError, TypeError, ValueError) as error:
            raise CinetPayUnavailable(
                "CinetPay n’a pas fourni une durée de validité de jeton valide."
            ) from error
        if (
            str(response_data.get("code")) != "200"
            or str(response_data.get("status", "")).upper() != "OK"
            or not isinstance(token, str)
            or not token
            or expires_in <= 0
            or str(response_data.get("token_type", "bearer")).lower() != "bearer"
        ):
            raise CinetPayUnavailable(
                "CinetPay n’a pas pu authentifier les identifiants du compte."
            )

        _access_token = token
        _access_token_fingerprint = fingerprint
        _access_token_expires_at = time.monotonic() + max(1, expires_in - 60)
        return token


def _request_json(endpoint, payload=None, *, method="POST"):
    _validate_configuration()
    return _send_json(
        method,
        endpoint,
        payload,
        access_token=_get_access_token(),
    )


def _return_url(payment_id):
    configured_url = settings.CINETPAY_RETURN_URL
    base_url = configured_url or (
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/api/paiements/cinetpay/retour"
    )
    parts = urlsplit(base_url)
    local_http_return = (
        settings.DEBUG
        and parts.scheme == "http"
        and parts.hostname in {"localhost", "127.0.0.1"}
    )
    if not parts.netloc or (parts.scheme != "https" and not local_http_return):
        raise CinetPayUnavailable("L’URL de retour CinetPay est invalide.")
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "payment_id"
    ]
    query.append(("payment_id", str(payment_id)))
    return_url = urlunsplit(parts._replace(query=urlencode(query)))
    if len(return_url) > 120:
        raise CinetPayUnavailable(
            "L’URL de retour CinetPay doit être limitée à 120 caractères."
        )
    return return_url


def create_checkout(payment):
    _validate_configuration(require_notify_url=True)

    traveler = payment.reservation.voyageur
    merchant_transaction_id = payment.reference_cinetpay
    if not merchant_transaction_id or len(merchant_transaction_id) > 30:
        raise CinetPayUnavailable(
            "La référence de transaction CinetPay est invalide."
        )

    return_url = _return_url(payment.pk)
    payload = {
        "merchant_transaction_id": merchant_transaction_id,
        "amount": int(payment.montant),
        "currency": "XOF",
        "designation": f"Réservation {payment.reservation.reference}",
        "client_first_name": traveler.prenoms or traveler.nom,
        "client_last_name": traveler.nom,
        "client_email": traveler.email,
        "notify_url": settings.CINETPAY_NOTIFY_URL,
        "success_url": return_url,
        "failed_url": return_url,
        "lang": "fr",
    }
    if traveler.telephone:
        payload["client_phone_number"] = traveler.telephone
    response_data = _request_json("/v1/payment", payload)
    if (
        str(response_data.get("code")) != "200"
        or str(response_data.get("status", "")).upper() != "OK"
    ):
        raise CinetPayUnavailable(
            "CinetPay n’a pas pu initialiser le paiement. "
            "Vérifiez les identifiants et les paramètres du compte."
        )

    payment_url = response_data.get("payment_url")
    notify_token = response_data.get("notify_token")
    returned_reference = response_data.get("merchant_transaction_id")
    if returned_reference and returned_reference != merchant_transaction_id:
        raise CinetPayUnavailable(
            "La référence renvoyée par CinetPay ne correspond pas au paiement."
        )
    if (
        not isinstance(payment_url, str)
        or urlsplit(payment_url).scheme != "https"
        or not urlsplit(payment_url).netloc
        or not isinstance(notify_token, str)
        or not notify_token
    ):
        raise CinetPayUnavailable(
            "La réponse CinetPay ne contient pas les informations de paiement requises."
        )
    return {
        "payment_url": payment_url,
        "notify_token": notify_token,
    }


def check_transaction(merchant_transaction_id):
    encoded_reference = quote(str(merchant_transaction_id), safe="")
    return _request_json(
        f"/v1/payment/{encoded_reference}",
        method="GET",
    )


def verify_webhook_token(expected_token, received_token):
    return (
        isinstance(expected_token, str)
        and bool(expected_token)
        and isinstance(received_token, str)
        and bool(received_token)
        and hmac.compare_digest(
            expected_token.encode("utf-8"),
            received_token.encode("utf-8"),
        )
    )
