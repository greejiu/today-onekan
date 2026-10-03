# Encrypted local snapshot, never included in Git or deployment.
# The private RSA key stays in the current Windows user's protected key container.
param([switch]$PublicKey, [string]$CipherChunk, [string]$Path='test-results/classification-production-backup.rsa')
$ErrorActionPreference='Stop'
$csp=[Security.Cryptography.CspParameters]::new()
$csp.KeyContainerName='TodayOnekan-Classification-Recovery-20261003'
$rsa=[Security.Cryptography.RSACryptoServiceProvider]::new(2048,$csp)
$rsa.PersistKeyInCsp=$true
if($PublicKey){
 $key=$rsa.ExportParameters($false)
 $padding=[byte[]]::new(16000)
 [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($padding)
 [pscustomobject]@{modulus=[Convert]::ToBase64String($key.Modulus);exponent=[Convert]::ToBase64String($key.Exponent);padding=[Convert]::ToBase64String($padding)}|ConvertTo-Json -Compress
 return
}
if($CipherChunk){
 $stream=[IO.File]::Open((Join-Path (Get-Location) $Path),[IO.FileMode]::Append)
 try{$bytes=[Convert]::FromBase64String($CipherChunk);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
 return
}
$reader=[IO.BinaryReader]::new([IO.File]::OpenRead((Join-Path (Get-Location) $Path)))
$memory=[IO.MemoryStream]::new()
try{
 while($reader.BaseStream.Position-lt $reader.BaseStream.Length){
  $cipher=$reader.ReadBytes(256)
  if($cipher.Length-ne 256){throw 'Incomplete encrypted block'}
  $plain=$rsa.Decrypt($cipher,$false)
  $memory.Write($plain,0,$plain.Length)
 }
 $snapshotBytes=$memory.ToArray()
}finally{$reader.Dispose();$memory.Dispose()}
$restored=[Text.Encoding]::UTF8.GetString($snapshotBytes)|ConvertFrom-Json
if($restored.project_id-ne 'mmpsyajgyufdxmmnxqba'){throw 'Unexpected project'}
$digest=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($snapshotBytes)).Replace('-','').ToLowerInvariant()
[pscustomobject]@{project=$restored.project_id;captured_at=$restored.captured_at;verified_sha256=$digest;encrypted_file=$Path;plaintext_file=$false}|ConvertTo-Json -Compress
