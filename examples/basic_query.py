"""Minimal AMS integration: swap `query` for `traced_query`.

Run with S3 (default):
    export AMS_S3_BUCKET=my-bucket
    export AMS_S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com  # R2/MinIO; omit for AWS
    python examples/basic_query.py

Or write locally instead:
    export AMS_STORAGE=local
    python examples/basic_query.py
"""

import anyio

from ams import Agent
from ams.claude import traced_query


async def main():
    async for message in traced_query(
        prompt="List the files in the current directory and summarize what this project does.",
        agent=Agent(name="demo", version="0.1.0"),
        environment="dev",
        tags=["example"],
    ):
        print(type(message).__name__)


if __name__ == "__main__":
    anyio.run(main)
