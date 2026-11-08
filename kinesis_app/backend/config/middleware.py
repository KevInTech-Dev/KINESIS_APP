import logging
from time import perf_counter

from django.conf import settings

logger = logging.getLogger("kinesis.performance")


class SlowRequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started_at = perf_counter()
        status_code = 500
        try:
            response = self.get_response(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = (perf_counter() - started_at) * 1000
            threshold_ms = settings.SLOW_REQUEST_LOG_THRESHOLD_MS
            if request.path.startswith("/api/") and duration_ms >= threshold_ms:
                logger.warning(
                    "Slow API request method=%s path=%s status=%s duration_ms=%.1f",
                    request.method,
                    request.path,
                    status_code,
                    duration_ms,
                )
