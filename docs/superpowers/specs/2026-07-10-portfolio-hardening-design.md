# Echo37 Portfolio Hardening Design

## Goal

Improve the existing Echo37 photography portfolio in five ordered stages:

1. Shared-password admin login and API protection.
2. Image deletion and upload limits.
3. First-screen caching and responsive images.
4. Admin safeguards against accidental or conflicting edits.
5. SEO and accessibility improvements.

The public portfolio remains open to everyone. Only the admin page and all mutating API operations require authentication.

## Existing System

The site is a vanilla HTML, CSS, and JavaScript application deployed to Netlify. Public configuration and uploaded images are stored in Netlify Blobs. Netlify Functions expose the configuration and upload endpoints. The current admin page edits one shared portfolio configuration.

The implementation must preserve the current visual direction, original image color and aspect ratio, click-to-next behavior, darkroom mode, random photo mode, and the absence of Contact, Instagram, image-description fields, JSON import/export, restore-default controls, and bottom-right text.

## Stage 1: Admin Login and API Protection

### Authentication model

The admin uses one shared password. The password is stored only in a Netlify encrypted environment variable and is never committed or sent to the browser except when the user submits the login form over HTTPS.

The login endpoint compares the submitted password with the configured secret using constant-time comparison. A successful login creates a signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookie valid for seven days. The signature includes a password-derived version so changing the environment password invalidates existing sessions.

The admin page initially shows a minimal login form. After authentication it loads the existing editor. A logout action clears the cookie. The public homepage and read-only configuration endpoint remain public.

### Protected operations

The following operations require a valid session:

- Writing portfolio configuration.
- Uploading images.
- Deleting stored images through configuration changes.
- Reading or restoring configuration history.

Unauthorized function requests return JSON with HTTP 401. The client returns to the login form when a session expires.

### Abuse protection

Failed login attempts are grouped by a privacy-preserving hash of the request IP and stored with a short expiry. Ten failed attempts within fifteen minutes produce HTTP 429. Successful login clears the attempt record. Mutation endpoints also apply conservative request-frequency limits per authenticated session.

## Stage 2: Image Deletion and Upload Limits

### Upload contract

The admin may select at most twenty files at once. The browser uploads files sequentially, one file per request, so each request remains below the Netlify Functions buffered payload limit. The interface reports the current file number and overall progress.

Each file must meet all of these conditions:

- JPEG, PNG, or WebP filename extension.
- Matching MIME type.
- Matching binary file signature.
- No larger than 5 MB.
- Valid positive width and height metadata within conservative numeric limits.

The server generates the blob key and never uses the original filename as a path. The upload response includes only `src`, `width`, and `height`. Original files remain unchanged in Netlify Blobs.

### Deletion lifecycle

Deleting a photo or collection in the editor changes only the local draft. On a successful configuration save, the server compares old and new image references. It saves the new configuration first, then deletes uploaded blobs no longer referenced by the current configuration or any of the ten retained history snapshots. Shared and restorable references are retained.

A daily scheduled cleanup lists uploaded blobs and removes files older than twenty-four hours that are absent from the current configuration and all retained history snapshots. This covers uploads abandoned before the editor is saved and files whose final history reference has rotated out. Cleanup never removes external image URLs or recently uploaded files.

## Stage 3: First-Screen Cache and Responsive Images

### Configuration loading

The browser stores the last successfully validated public configuration in local storage. On repeat visits it renders that cached configuration immediately, then requests the current server configuration and updates only when the server result differs.

On a first visit, the page displays a neutral lightweight placeholder until the server responds. It never renders the bundled Unsplash example as an error fallback. If the server fails and a cached configuration exists, the cached site remains visible. If no cache exists, the page shows a restrained retry state.

HTML and configuration responses remain revalidated. Static CSS and JavaScript use cache validation instead of `no-store`. Immutable uploaded images retain their one-year cache policy.

### Responsive images

Uploaded image URLs are transformed through Netlify Image CDN. Public images expose width candidates suitable for phones, desktop displays, and high-density screens while preserving the original aspect ratio and color. The browser receives `srcset` and `sizes` and chooses the appropriate candidate.

New uploads store original dimensions in configuration. The photo frame uses those dimensions to reserve layout space. Existing images without dimensions continue to work and acquire dimensions when loaded in the admin and next saved.

The first visible image uses high fetch priority. Later images use asynchronous decoding, and the next image is preloaded at an appropriate rendered width. Admin thumbnails request small transformed images instead of original files.

## Stage 4: Admin Safeguards

### Unsaved work

The editor tracks dirty, uploading, and saving states. Leaving, refreshing, logging out, or navigating away while dirty or busy triggers a confirmation. Upload and save controls are disabled while their operation is active. Failed operations preserve the draft and return specific, readable errors.

Deleting one image provides a temporary undo action. Collection deletion retains the existing confirmation and includes its image count. Before saving a draft that removes images, the editor clearly states the number of images that will be removed.

### Concurrent editing

Each configuration has a monotonically increasing revision. A save includes the revision the editor originally loaded. If the server revision has changed, the server returns HTTP 409 and does not overwrite the newer configuration. The editor explains that another person saved changes and offers a reload action.

### Version history

Before each successful configuration write, the server stores the previous configuration as a versioned snapshot. It retains the ten newest snapshots. The admin exposes a compact version-history view with timestamp and restore action. Restoring creates a new revision and snapshot; it does not reintroduce restore-default, JSON import, or JSON export controls.

## Stage 5: SEO and Accessibility

### SEO and sharing

The public page includes a specific title, Chinese description, canonical URL, Open Graph metadata, theme color, and Echo37 favicon. `robots.txt` and `sitemap.xml` expose only public content. The admin page uses `noindex, nofollow`.

A public Open Graph image endpoint resolves the current first public photo so shared links use current portfolio imagery. Collection and photo state are encoded in URL parameters. Opening or refreshing a shared URL restores the corresponding collection and image.

### Accessible interaction

Images use generated labels in the form `<collection name>, 第 <n> 张摄影作品`; random upload filenames are not exposed as descriptions. The clickable photo has button semantics and supports Enter and Space in addition to left and right arrow navigation.

Mobile users can swipe left and right. The current image count remains visible on touch layouts. Focus-visible styling is clear, active green text meets small-text contrast requirements, and animations respect `prefers-reduced-motion`.

Login status, save status, upload progress, undo controls, and validation messages use appropriate labels and live-region behavior. Security response headers include a restrictive Content Security Policy, frame protection, content-type protection, and a conservative referrer policy.

## Data Model

The normalized configuration contains:

```json
{
  "name": "Echo37",
  "revision": 12,
  "updatedAt": "2026-07-10T12:00:00.000Z",
  "collections": [
    {
      "name": "新疆 2026",
      "photos": [
        {
          "src": "/uploads/example.jpg",
          "width": 1706,
          "height": 1280
        }
      ]
    }
  ]
}
```

`activeCollectionIndex` is editor-only state and is not treated as public content. Legacy `alt` values remain accepted during migration but public labels are derived from collection and position.

## Error Handling

All API errors use JSON with a stable code and human-readable Chinese message. Expected statuses are 400 for invalid input, 401 for missing or expired authentication, 409 for revision conflicts, 413 for oversized requests, 429 for rate limiting, and 500 for unexpected storage failures.

Configuration writes validate collection counts, photo counts, string lengths, image paths, dimensions, and revision before storing anything. Blob deletion occurs only after a successful configuration write. Cleanup failures are logged and do not roll back a valid configuration save.

## Testing and Verification

Each stage follows test-driven development. Tests cover session signing and expiry, password rotation, authorization on every mutation endpoint, file signature validation, upload limits, reference-difference deletion, orphan cleanup selection, cache fallback, responsive URL generation, revision conflicts, version retention, URL state restoration, keyboard interaction, swipe thresholds, metadata, and accessibility attributes.

Before production deployment, run all Node tests, JavaScript and TypeScript checks, the static build command, and browser tests at desktop and mobile viewport sizes. Deploy a Netlify preview first, verify login and storage behavior there, then deploy production and verify public pages, protected endpoints, responsive images, headers, metadata, and logout.

## Deployment Requirements

Production requires two encrypted Netlify environment variables:

- `ADMIN_PASSWORD`: the shared administrator password.
- `SESSION_SECRET`: a separate high-entropy signing secret.

Neither value is stored in repository files. Deployment must stop with a clear setup message if either variable is missing. The final handoff includes the public URL, admin URL, password-change procedure, friend-login instructions, and verification results without exposing either secret.
