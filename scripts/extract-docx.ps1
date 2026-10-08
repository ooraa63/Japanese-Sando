# Ekstrak teks dari .docx tanpa Python/pandoc.
# Dipakai kalau read gate docx skill tidak tersedia (python cuma alias Store).
#   powershell -ExecutionPolicy Bypass -File extract-docx.ps1 <path.docx>
param(
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$full = (Resolve-Path -LiteralPath $Path).Path
$tmp = Join-Path $env:TEMP ("docx-extract-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
  $zipPath = Join-Path $tmp 'doc.zip'
  Copy-Item -LiteralPath $full -Destination $zipPath -Force
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, (Join-Path $tmp 'x'))

  $docPath = Join-Path $tmp 'x\word\document.xml'
  if (-not (Test-Path $docPath)) { throw "word/document.xml tidak ada di dalam docx" }

  $xml = New-Object System.Xml.XmlDocument
  $xml.PreserveWhitespace = $true
  $xml.Load($docPath)

  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')

  # Ambil gambar yang tertanam (untuk memberi konteks pada screenshot).
  $relsPath = Join-Path $tmp 'x\word\_rels\document.xml.rels'
  $relMap = @{}
  if (Test-Path $relsPath) {
    $rels = New-Object System.Xml.XmlDocument
    $rels.Load($relsPath)
    foreach ($r in $rels.Relationships.Relationship) { $relMap[$r.Id] = $r.Target }
  }

  $body = $xml.SelectSingleNode('//w:body', $ns)
  $n = 0
  foreach ($node in $body.ChildNodes) {
    switch ($node.LocalName) {
      'p' {
        $n++
        $texts = @()
        foreach ($t in $node.SelectNodes('.//w:t', $ns)) { $texts += $t.InnerText }
        foreach ($br in $node.SelectNodes('.//w:br', $ns)) { }
        $line = ($texts -join '')
        $styleNode = $node.SelectSingleNode('./w:pPr/w:pStyle', $ns)
        $style = if ($styleNode) { $styleNode.GetAttribute('val', $ns.LookupNamespace('w')) } else { '' }
        $hasImg = $node.SelectNodes('.//a:blip', $ns).Count -gt 0
        if ($line.Trim().Length -gt 0) {
          $tag = if ($style) { "[$style] " } else { '' }
          Write-Output ("P{0,-3} {1}{2}" -f $n, $tag, $line)
        } elseif ($hasImg) {
          Write-Output ("P{0,-3} <gambar>" -f $n)
        }
      }
      'tbl' {
        $n++
        Write-Output ("P{0,-3} --- TABEL ---" -f $n)
        foreach ($row in $node.SelectNodes('./w:tr', $ns)) {
          $cells = @()
          foreach ($tc in $row.SelectNodes('./w:tc', $ns)) {
            $ct = @()
            foreach ($t in $tc.SelectNodes('.//w:t', $ns)) { $ct += $t.InnerText }
            $cells += (($ct -join '').Trim())
          }
          Write-Output ("      " + ($cells -join ' | '))
        }
        Write-Output "      --- AKHIR TABEL ---"
      }
    }
  }
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}