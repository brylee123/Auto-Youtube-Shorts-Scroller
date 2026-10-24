# [Auto-Youtube-Shorts-Scroller](https://github.com/Tyson3101/Auto-Youtube-Shorts-Scroller)

#### DOWNLOAD LATEST VERSION : [https://chromewebstore.google.com/detail/auto-youtube-shorts-scrol/ckbnikemebopgknkpgjlkbffpkkhblbe](https://chromewebstore.google.com/detail/auto-youtube-shorts-scrol/ckbnikemebopgknkpgjlkbffpkkhblbe)

## A Chrome Extension/Bookmarklet that adds an auto-scroll feature on Youtube so you can watch Shorts without the need to touch your mouse.

<img src="./extension/img/autoYTScrollerIcon128.png"/>

#### Whenever a YT Short ends, the extension will automatically scroll to the next one for you. Great for doing homework and watching Shorts at the same time without the need to switch tabs!

- Chrome Extension: [Click here](./README.md#chrome-extension)

- Firefox Add-On: [Click here](./README.md#firefox-add-on)

- Bookmarklet: [Click here](./README.md#bookmarklet)

## Chrome Extension

**Option 1** – Install it from the [Chrome Web Store](https://chrome.google.com/webstore/detail/ckbnikemebopgknkpgjlkbffpkkhblbe)

**Option 2** – Install it from source:

- Clone/download this repo,
- Open Chrome and go to `chrome://extensions`,
- Enable "Developer mode",
- Click "Load unpacked extension",
- Select the `extension` folder from this repo.

<img src="./images/ScreenshotGoogleExtensionYoutube1.png" width="500" height="400" />

## Picture-in-picture playback (Chrome)

With auto-scrolling enabled, open a Short in Chrome's native picture-in-picture
mode (right-click the video twice, then select **Picture in picture**). Leave the
YouTube tab open; you can switch to another tab or application.

While PiP is open, the extension uses YouTube's next/previous button to advance
without waiting for a smooth scroll in the background tab. Repeat counts,
filters, comment-pause settings, and the additional scroll delay still apply.
It also detects video replacements and attempts to transfer an existing PiP
session to the new video.

**Browser limitation:** If YouTube removes the old video and Chrome closes PiP,
or Chrome rejects transferring PiP without a user gesture, reopen PiP on the
current Short. The extension cannot guarantee uninterrupted PiP across every
YouTube player replacement. Closing PiP yourself will not reopen it.

To try this fork, load its `extension` folder as an unpacked extension using
Option 2 above. The Chrome Web Store version linked above does not include this
fork's changes. See [the PiP test checklist](./tests/PIP_TESTING.md).

## Firefox Add-On

For Firefox, you can find a fork of this extension by [SoRadGaming](https://github.com/SoRadGaming). <br/>
The download for the ported add-on can be found [on their repository.](https://github.com/SoRadGaming/Auto-Youtube-Shorts-Scroller)

## Bookmarklet

**Go to this link and save the shown link to your bookmarks (Drag to your bookmark bar)** 
Link: [https://tyson3101.github.io/Auto-Youtube-Shorts-Scroller/bookmarklet/bookmarklet.html](https://tyson3101.github.io/Auto-Youtube-Shorts-Scroller/bookmarklet/bookmarklet.html) 

<img src="./images/GoogleExtensionGif.gif" width="486" height="363" />

##### If you have any suggestions or experience problems, post an issue on the GitHub page: [https://github.com/Tyson3101/Auto-Youtube-Shorts-Scroller/issues](https://github.com/Tyson3101/Auto-Youtube-Shorts-Scroller/issues)

###### Created by Tyson3101
