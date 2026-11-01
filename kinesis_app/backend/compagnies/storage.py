import os

import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url
from cloudinary_storage.storage import MediaCloudinaryStorage
from django.utils.deconstruct import deconstructible


@deconstructible
class AuthenticatedCompanyDocumentStorage(MediaCloudinaryStorage):
    def _upload(self, name, content):
        options = {
            "use_filename": True,
            "resource_type": self._get_resource_type(name),
            "tags": self.TAG,
            "type": "authenticated",
            "access_mode": "authenticated",
        }
        folder = os.path.dirname(name)
        if folder:
            options["folder"] = folder
        return cloudinary.uploader.upload(content, **options)

    def _get_url(self, name):
        name = self._prepend_prefix(name)
        url, _ = cloudinary_url(
            name,
            resource_type=self._get_resource_type(name),
            type="authenticated",
            sign_url=True,
            secure=True,
        )
        return url

    def delete(self, name):
        response = cloudinary.uploader.destroy(
            name,
            invalidate=True,
            resource_type=self._get_resource_type(name),
            type="authenticated",
        )
        return response.get("result") == "ok"
