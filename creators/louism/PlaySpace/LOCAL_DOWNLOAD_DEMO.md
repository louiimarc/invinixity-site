# Local Poster Download Demo

PlaySpace now serves the kiosk shell, QR codes, and finished poster downloads
from the Mac. The poster handoff uses no internet connection, external domain,
or cloud server. The existing optional MediaPipe camera helper remains outside
the scope of this download demo and may still request its external resources.

## Start the demo

```sh
npm install
npm start
```

Open `http://localhost:8080` on the kiosk Mac. The visitor download URL is built
from the Mac's existing Local Hostname automatically. Starting the demo does not
rename the Mac or change any network setting.

The current client demo skips the Wi-Fi join screen and opens the unique poster
QR directly. This lets the interaction be presented before the event network
exists.

For the event, enable the two-step Wi-Fi flow while setting the router details:

- Name: `PlaySpace`
- Security: `WPA`
- Password: `playspace-demo`

Override them when starting the server if the event router uses different
details:

```sh
PLAYSPACE_WIFI_NAME="PlaySpace" \
PLAYSPACE_WIFI_PASSWORD="your-event-password" \
PLAYSPACE_SKIP_WIFI="false" \
npm start
```

After Card Preview, Finish creates a unique poster session. The kiosk first
shows the Wi-Fi QR and a Next button, then shows the poster download QR. Posters
expire after 15 minutes by default and are stored only in the ignored
`.playspace-downloads` directory.

To change the expiry for an event:

```sh
PLAYSPACE_EXPIRY_MINUTES="10" npm start
```

If a custom public address is ever needed, set `PLAYSPACE_PUBLIC_ORIGIN`. When it
is omitted, the server reads the Mac's current Local Hostname and uses its
`.local` address without modifying it.
