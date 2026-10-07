# shadcn stylesheet provenance

`shadcn.css` is an unmodified copy of `package/dist/tailwind.css` from
the npm tarball `shadcn@4.8.0`, the version locked by master before this change.
Source: https://registry.npmjs.org/shadcn/-/shadcn-4.8.0.tgz

- Bytes: 1,669
- SHA256: `146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6`
- License: MIT; the original license is preserved as `shadcn.LICENSE.md`.

The app imported only this stylesheet from the CLI package. Keeping this exact
file removes the CLI/transitive graph while preserving the original CSS content.
Review style changes explicitly when updating this vendored file.
