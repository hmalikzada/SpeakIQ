# SpeakIQ — local dev server (fallback when Node.js is not available)
# Uses $PSScriptRoot so it works from any machine, not a hardcoded path.
# Preferred: use `npm start` instead (server.js proxy keeps key server-side).

$root = $PSScriptRoot
$port = 5173
$prefix = "http://localhost:$port/"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "SpeakIQ dev server: $prefix"
Write-Host "(Note: use 'npm start' for full proxy mode with server-side API key)"

$mimeMap = @{
    '.html' = 'text/html'
    '.js'   = 'application/javascript'
    '.mjs'  = 'application/javascript'
    '.css'  = 'text/css'
    '.json' = 'application/json'
    '.bin'  = 'application/octet-stream'
    '.mp3'  = 'audio/mpeg'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
}

while ($listener.IsListening) {
    $ctx   = $listener.GetContext()
    $local = $ctx.Request.Url.LocalPath
    if ($local -eq '/') { $local = '/index.html' }

    # Normalise and prevent path traversal
    $rel  = $local.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $path = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $rel))

    # Block traversal outside $root
    if (-not $path.StartsWith($root)) {
        $ctx.Response.StatusCode = 403
        $ctx.Response.Close()
        continue
    }

    if (Test-Path $path -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $ext   = [System.IO.Path]::GetExtension($path).ToLower()
        $mime  = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
        $ctx.Response.ContentType     = $mime + '; charset=utf-8'
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
