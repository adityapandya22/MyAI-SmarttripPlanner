import crypto from 'node:crypto'

export function attachRequestId(req, res) {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID()
  req.id = reqId
  res.setHeader('X-Request-Id', reqId)
  return reqId
}

export function handleServerError(err, req, res) {
  const reqId = req?.id || crypto.randomUUID()
  const timestamp = new Date().toISOString()

  console.error(`[ERROR ${timestamp}] [req:${reqId}] ${req?.method} ${req?.url} ->`, err?.stack || err)

  if (!res.headersSent) {
    const isClientError = err?.statusCode >= 400 && err?.statusCode < 500
    const statusCode = isClientError ? err.statusCode : 500
    const message = isClientError ? err.message : 'Internal Server Error'

    const payload = JSON.stringify({
      error: message,
      requestId: reqId,
      details: err?.details || undefined,
    })

    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'X-Request-Id': reqId,
    })
    res.end(payload)
  }
}
