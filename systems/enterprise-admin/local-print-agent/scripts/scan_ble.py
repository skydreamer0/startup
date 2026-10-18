"""Read-only BLE advertisement scan, with optional targeted service discovery.

This wrapper delegates to the installed deli720w CLI; it never writes GATT data.
"""

from deli720w.cli import main


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:] or ["list"]))
