# Ekstrak gambar-gambar yang tertanam di dalam .docx, dengan urutan kemunculannya.
#   powershell -ExecutionPolicy Bypass -File extract-docx-images.ps1 <path.docx> [outDir]
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$OutDir = "$env:TEMP\docx-images"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$full = (Resolve-Path -LiteralPath $Path).Path
$tmp = Join-Path $env:TEMP ("docx-img-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

try {
  $zipPath = Join-Path $tmp 'doc.zip'
  Copy-Item -LiteralPath $full -Destination $zipPath -Force
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, (Join-Path $tmp 'x'))

  $docPath = Join-Path $tmp 'x\word\document.xml'
  $xml = New-Object System.Xml.XmlDocument
  $xml.Load($docPath)

  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
  $ns.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')

  # Peta rId -> nama file di folder media
  $relsPath = Join-Path $tmp 'x\word\_rels\document.xml.rels'
  $relMap = @{}
  $rels = New-Object System.Xml.XmlDocument
  $rels.Load($relsPath)
  foreach ($rel in $rels.Relationships.Relationship) { $relMap[$rel.Id] = $rel.Target }

  $mediaDir = Join-Path $tmp 'x\word\media'
  $i = 0
  foreach ($blip in $xml.SelectNodes('//a:blip', $ns)) {
    $i++
    $rid = $blip.GetAttribute('embed', $ns.LookupNamespace('r'))
    if (-not $rid -or -not $relMap.ContainsKey($rid)) { continue }
    $target = $relMap[$rid] -replace '^media/', ''
    $src = Join-Path $mediaDir $target
    if (-not (Test-Path $src)) { continue }
    $ext = [System.IO.Path]::GetExtension($target)
    $dest = Join-Path $OutDir ("img{0:d2}{1}" -f $i, $ext)
    Copy-Item -LiteralPath $src -Destination $dest -Force
    $len = (Get-Item $src).Length
    Write-Output ("img{0:d2}  {1,-12} {2,8} bytes  -> {3}" -f $i, $target, $len, $dest)
  }
  Write-Output ""
  Write-Output "Total gambar: $i"
  Write-Output "Folder: $OutDir"
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}