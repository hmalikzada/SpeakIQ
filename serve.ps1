$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:5173/")
$listener.Start()
Write-Host "SpeakIQ server running at http://localhost:5173/"
while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $local = $ctx.Request.Url.LocalPath
    if ($local -eq '/') { $local = '/index.html' }
    $path = "C:\Users\haseebm\Desktop\SpeakIQ" + $local.Replace('/', '\')
    if (Test-Path $path -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $ext = [System.IO.Path]::GetExtension($path)
        $mimeMap = @{'.html'='text/html';'.js'='application/javascript';'.css'='text/css';'.json'='application/json'}
        $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
        $ctx.Response.ContentType     = $mime + "; charset=utf-8"
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
