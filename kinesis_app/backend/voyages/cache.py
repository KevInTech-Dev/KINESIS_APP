import hashlib
import json
import logging
import uuid

from django.core.cache import cache
from redis.exceptions import RedisError
from rest_framework.renderers import JSONRenderer

PUBLIC_CITIES_CACHE_KEY = "voyages:public:cities"
PUBLIC_CITIES_CACHE_TIMEOUT = 300
PUBLIC_VOYAGES_GENERATION_KEY = "voyages:public:generation"
PUBLIC_VOYAGES_CACHE_TIMEOUT = 20

logger = logging.getLogger(__name__)


def _read_json(key):
    try:
        value = cache.get(key)
    except (RedisError, OSError, TimeoutError):
        logger.warning("Redis cache read failed for key %s.", key, exc_info=True)
        return None

    if not isinstance(value, str):
        return None

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        logger.warning("Discarding invalid JSON from cache key %s.", key)
        _delete_key(key)
        return None


def _write_json(key, value, timeout):
    try:
        rendered = JSONRenderer().render(value).decode("utf-8")
        cache.set(key, rendered, timeout=timeout)
    except (RedisError, OSError, TimeoutError):
        logger.warning("Redis cache write failed for key %s.", key, exc_info=True)


def _delete_key(key):
    try:
        cache.delete(key)
    except (RedisError, OSError, TimeoutError):
        logger.warning("Redis cache delete failed for key %s.", key, exc_info=True)


def get_cached_public_cities():
    return _read_json(PUBLIC_CITIES_CACHE_KEY)


def cache_public_cities(data):
    _write_json(PUBLIC_CITIES_CACHE_KEY, data, PUBLIC_CITIES_CACHE_TIMEOUT)


def get_public_voyages_cache_key(request):
    try:
        generation = cache.get(PUBLIC_VOYAGES_GENERATION_KEY)
        if generation is None:
            generation = uuid.uuid4().hex
            cache.add(PUBLIC_VOYAGES_GENERATION_KEY, generation, timeout=None)
            generation = cache.get(PUBLIC_VOYAGES_GENERATION_KEY) or generation
    except (RedisError, OSError, TimeoutError):
        logger.warning(
            "Redis cache key lookup failed for public voyages.",
            exc_info=True,
        )
        return None

    query_hash = hashlib.sha256(
        request.query_params.urlencode().encode("utf-8")
    ).hexdigest()
    return f"voyages:public:search:{generation}:{query_hash}"


def get_cached_public_voyages(key):
    return _read_json(key)


def cache_public_voyages(key, data):
    _write_json(key, data, PUBLIC_VOYAGES_CACHE_TIMEOUT)


def invalidate_public_voyages_cache():
    try:
        cache.set(PUBLIC_VOYAGES_GENERATION_KEY, uuid.uuid4().hex, timeout=None)
    except (RedisError, OSError, TimeoutError):
        logger.warning("Could not invalidate public voyage cache.", exc_info=True)


def invalidate_public_cities_cache():
    _delete_key(PUBLIC_CITIES_CACHE_KEY)
