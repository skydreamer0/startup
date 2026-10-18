[CmdletBinding()]
param([string]$OutputPath)
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
  $OutputPath = Join-Path $scriptDirectory '..\reports\device_info.json'
}
$ErrorActionPreference = 'Continue'
$script:errors = [System.Collections.Generic.List[string]]::new()
function Try-Query([string]$Label,[scriptblock]$Query) {
  try { @(& { $ErrorActionPreference = 'Stop'; & $Query }) } catch { $script:errors.Add("${Label}: $($_.Exception.Message)"); @() }
}
function Hide-Id([string]$Value) {
  if (-not $Value) { return $null }
  $v = $Value -replace '(?i)([0-9A-F]{12})','[REDACTED_ADDRESS]'
  $v = $v -replace '(?<=\\)[^\\]+$','[REDACTED_INSTANCE]'
  return $v
}
$btPorts = Try-Query 'Bluetooth ports' { Get-PnpDevice -Class Ports | Where-Object InstanceId -like 'BTHENUM*' | ForEach-Object {
  [pscustomobject]@{ Name=$_.Class; Port=$_.FriendlyName -replace '.*\((COM\d+)\).*','$1'; Status=$_.Status; InstanceId=(Hide-Id $_.InstanceId); SppServiceUuid=if ($_.InstanceId -match '\{(00001101-[^}]+)\}') {$Matches[1]} else {$null} }
} }
$btDevices = Try-Query 'Bluetooth devices' { Get-PnpDevice -Class Bluetooth | ForEach-Object {
  [pscustomobject]@{ Class=$_.Class; Status=$_.Status; Manufacturer=$_.Manufacturer; InstanceId=(Hide-Id $_.InstanceId) }
} }
$serial = Try-Query 'Serial ports' { Get-CimInstance Win32_SerialPort | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Port=$_.DeviceID; Status=$_.Status; PnpId=(Hide-Id $_.PNPDeviceID) } } }
$printers = Try-Query 'Printers' { Get-CimInstance Win32_Printer | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Driver=$_.DriverName; Port=$_.PortName; Status=$_.PrinterStatus; PnpId=(Hide-Id $_.PNPDeviceID) } } }
$printerPorts = Try-Query 'Printer ports' { Get-PrinterPort | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Description=$_.Description; Monitor=$_.PortMonitor; HasHostAddress=[bool]$_.PrinterHostAddress; PortNumber=$_.PortNumber } } }
$printerDrivers = Try-Query 'Printer drivers' { Get-PrinterDriver | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Manufacturer=$_.Manufacturer; MajorVersion=$_.MajorVersion; InfPath=$_.InfPath } } }
$usb = Try-Query 'USB devices' { Get-PnpDevice -PresentOnly | Where-Object {$_.Class -eq 'USB'} | ForEach-Object { [pscustomobject]@{ Name=$_.FriendlyName; Status=$_.Status; Manufacturer=$_.Manufacturer; InstanceId=(Hide-Id $_.InstanceId) } } }
$usbPrint = Try-Query 'USB printer interfaces' { Get-CimInstance Win32_PnPEntity | Where-Object {$_.PNPDeviceID -match '^USBPRINT\\' -or $_.Name -match 'USB Printing Support|USB printer'} | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Manufacturer=$_.Manufacturer; Status=$_.Status; PnpId=(Hide-Id $_.PNPDeviceID) } } }
$drivers = Try-Query 'Signed Bluetooth drivers' { Get-CimInstance Win32_PnPSignedDriver | Where-Object DeviceName -match 'Bluetooth' | ForEach-Object { [pscustomobject]@{ Name=$_.DeviceName; Version=$_.DriverVersion; Date=$_.DriverDate; Manufacturer=$_.Manufacturer; Inf=$_.InfName; Signed=$_.IsSigned } } }
$osResult = Try-Query 'Operating system' { Get-CimInstance Win32_OperatingSystem }
$os = @($osResult)[0]
$result = [ordered]@{
  collectedAt = (Get-Date).ToString('o')
  scope = 'Read-only Windows inventory; identifiers are redacted.'
  operatingSystem = if ($os) {@{Name=$os.Caption; Version=$os.Version; Build=$os.BuildNumber; Architecture=$os.OSArchitecture}} else {$null}
  bluetoothDevices = @($btDevices)
  bluetoothSerialPorts = @($btPorts)
  serialPorts = @($serial)
  printers = @($printers)
  printerPorts = @($printerPorts)
  printerDrivers = @($printerDrivers)
  presentUsbDevices = @($usb)
  usbPrintInterfaces = @($usbPrint)
  signedBluetoothDrivers = @($drivers)
  queryErrors = @($script:errors)
}
$resolved = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path $resolved) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolved -Encoding utf8
Write-Output $resolved
