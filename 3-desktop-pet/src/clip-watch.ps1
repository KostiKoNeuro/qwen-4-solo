# Clipboard watcher for Taskbar Magpie. Runs in its own process so that a
# blocked Windows clipboard can never freeze the pet. Emits one base64(UTF-8)
# line whenever the copied text changes. The initial content is the baseline
# and is not emitted.
$ErrorActionPreference = 'SilentlyContinue'
$last = Get-Clipboard -Raw
while ($true) {
    Start-Sleep -Milliseconds 400
    $t = Get-Clipboard -Raw
    if ($t -and $t -ne $last) {
        $last = $t
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($t)
        [Console]::Out.WriteLine([Convert]::ToBase64String($bytes))
        [Console]::Out.Flush()
    }
}
