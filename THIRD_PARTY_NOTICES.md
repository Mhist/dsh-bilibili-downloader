# Third-party notices

## FFmpeg

This package does **not** include FFmpeg. When a DASH download needs merging and
no FFmpeg is configured, the plugin downloads a static Windows build from one of
these npm packages at runtime and stores it under
`<DSH_HOME>/bilibili-downloader/bin/ffmpeg.exe`:

- `@ffmpeg-installer/win32-x64` (published by `ffmpeg-installer`)
  - `https://registry.npmmirror.com/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz`
  - `https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz`

The downloaded file is verified by size and SHA-256 before it is used:

```
size   64458752
sha256 c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e
```

FFmpeg is a separate project by the FFmpeg team, licensed under the
LGPL-2.1-or-later (and GPL-2.0-or-later for builds configured with `--enable-gpl`;
the fetched build is such a build). FFmpeg source code and license text are
available at <https://ffmpeg.org/> and <https://ffmpeg.org/legal.html>. The
plugin only downloads and executes the binary; it does not modify it.

If you redistribute a bundle that vendors `vendor/ffmpeg.exe` (for example with
`npm run fetch:ffmpeg`), **you** are responsible for complying with FFmpeg's
license, including providing the corresponding source and license notices.

## Bilibili

This plugin talks to public Bilibili endpoints to list an uploader's videos and
download the files the user's own account is allowed to fetch. It is not
affiliated with or endorsed by Bilibili. Users are responsible for following
Bilibili's terms of service and applicable copyright law.
