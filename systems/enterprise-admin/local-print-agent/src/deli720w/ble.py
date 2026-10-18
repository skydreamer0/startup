"""Bounded BLE discovery. No GATT read/write or print transport."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from bleak import BleakClient, BleakScanner


def is_deli_name(name: str | None) -> bool:
    lowered = (name or "").strip().casefold()
    return lowered.startswith("deli") or "dl-720w" in lowered or "720w" in lowered


@dataclass(frozen=True)
class SeenDevice:
    name: str
    address: str
    rssi: int | None
    service_uuids: tuple[str, ...]


async def scan(timeout: float = 8.0) -> list[SeenDevice]:
    if not 2 <= timeout <= 30:
        raise ValueError("scan timeout must be 2–30 seconds")
    observations = await asyncio.wait_for(BleakScanner.discover(timeout=timeout, return_adv=True), timeout=timeout + 3)
    found: list[SeenDevice] = []
    for device, advert in observations.values():
        name = advert.local_name or device.name or ""
        if is_deli_name(name):
            found.append(SeenDevice(name, device.address, advert.rssi, tuple(advert.service_uuids or ())))
    return sorted(found, key=lambda item: item.name.casefold())


async def services(target_address: str, *, scan_timeout: float = 8.0, connection_timeout: float = 8.0) -> dict:
    if not target_address.strip():
        raise ValueError("an explicit target address is required")
    if not 2 <= scan_timeout <= 30:
        raise ValueError("scan timeout must be 2–30 seconds")
    if not 2 <= connection_timeout <= 20:
        raise ValueError("connection timeout must be 2–20 seconds")
    # BleakClient receives only the scanned, name-verified BLEDevice object.
    observations = await asyncio.wait_for(BleakScanner.discover(timeout=scan_timeout, return_adv=True), timeout=scan_timeout + 3)
    selected = None
    for device, advert in observations.values():
        name = advert.local_name or device.name or ""
        if device.address.casefold() == target_address.casefold() and is_deli_name(name):
            selected = device
            break
    if selected is None:
        raise ValueError("target was not observed advertising with a DELI / 720W name")
    client = BleakClient(selected, timeout=connection_timeout)
    try:
        await asyncio.wait_for(client.connect(), timeout=connection_timeout)
        result = {"name": selected.name, "mtu": client.mtu_size, "services": []}
        for service in client.services:
            result["services"].append({
                "uuid": service.uuid,
                "characteristics": [
                    {"uuid": char.uuid, "properties": sorted(char.properties)}
                    for char in service.characteristics
                ],
            })
        return result
    finally:
        if client.is_connected:
            await asyncio.wait_for(client.disconnect(), timeout=5)
