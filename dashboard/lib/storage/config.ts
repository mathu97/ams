export type DataSource = "s3" | "local"

export function getDataSource(): DataSource {
  const explicit = process.env.AMS_DATA_SOURCE?.toLowerCase()
  if (explicit === "s3" || explicit === "local") {
    return explicit
  }
  if (process.env.AMS_S3_BUCKET) return "s3"
  if (process.env.AMS_LOCAL_DIR) return "local"
  throw new Error(
    "No data source configured. Set AMS_S3_BUCKET (or AMS_DATA_SOURCE=s3), " +
      "or AMS_LOCAL_DIR (or AMS_DATA_SOURCE=local).",
  )
}

export function getS3Config() {
  const bucket = process.env.AMS_S3_BUCKET
  if (!bucket) {
    throw new Error("AMS_S3_BUCKET is not set")
  }
  return {
    bucket,
    prefix: (process.env.AMS_S3_PREFIX ?? "ams").replace(/^\/|\/$/g, ""),
    region: process.env.AMS_S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.AMS_S3_ENDPOINT_URL,
  }
}

export function getLocalDir(): string {
  const dir = process.env.AMS_LOCAL_DIR
  if (!dir) {
    throw new Error("AMS_LOCAL_DIR is not set")
  }
  return dir
}
