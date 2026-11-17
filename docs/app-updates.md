# APK releases and Expo updates

The distributed Android APK uses the `preview` build profile and the `production` update channel. The profile name remains unchanged so the GitHub APK workflow keeps working. The production build profile uses the same update channel and environment.

Install the first APK built with expo-updates to enable updates. Previously installed APKs without this module cannot receive them.

## Build an APK

```sh
npx eas-cli@latest build --platform android --profile preview
```

The existing GitHub Actions APK workflow also includes these settings after the configuration is pushed. Keep the Android package and existing signing key to install over the previous app and preserve its records.

## Publish a compatible Android update

From the exact, tested release checkout:

```sh
npx eas-cli@latest update --channel production --platform android --environment production --message "Describe the update"
```

Publishing sends code to installed user apps on this channel. Test before publishing; committing or building alone does not publish an update.

The fingerprint runtime policy matches an update to compatible native code. Native dependencies, configuration, widgets, or Expo SDK changes can require a new APK. If the runtime fingerprint changes, older APKs will not load that update.

Updates check on app launch without delaying startup for a network download. A downloaded update normally applies on a later cold launch. No forced restart interrupts data entry. Offline users continue using their installed version. Expo updates do not intentionally reset the local database, but database changes still require compatible migrations and testing.

To verify delivery on a device, install the update-enabled release APK, publish a compatible test change, open it online to download, then fully close and reopen it. Expo Go is not an end-to-end test of release update delivery.
