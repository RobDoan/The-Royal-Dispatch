import os
import boto3
from dotenv import load_dotenv

load_dotenv()

_client = None


def get_storage():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            aws_access_key_id=os.environ["S3_ACCESS_KEY"],
            aws_secret_access_key=os.environ["S3_SECRET_KEY"],
            endpoint_url=os.environ["S3_ENDPOINT_URL"],
        )
    return _client
