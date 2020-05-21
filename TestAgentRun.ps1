Invoke-Expression "& .\node10.exe main.js 2>''" -ErrorVariable errout -OutVariable stdout
$str = $errout | Select-Object -first 1
if ($str -Match "Input required: authenticationMethod") {
  Write-Output "Test passed"
  exit 0
} else {
  Write-Output $str
  exit 1
}