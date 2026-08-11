# VITImeasure

A mobile app for people with vitiligo to photograph, measure, and track their skin patches over time.

## Overview

VITImeasure lets users scan affected body areas with their phone camera, get automated measurements of vitiligo coverage, and monitor changes week over week. It includes weekly wellness check-ins (stress, sleep, mood), daily stress tracking, VASI scoring, and PDF report generation — all designed to help users and their dermatologists understand progression patterns.

## Prerequisites

- **Node.js** >= 18
- **Expo CLI** (`npx expo` — bundled with the `expo` package)
- **iOS**: Xcode 15+ and CocoaPods (iOS 16.0+ deployment target)
- **Android**: Android Studio with SDK installed
- The [VITImeasure backend API](https://github.com/ArnavDasoju/vitimeasure-api) (deployed at `https://vitimeasure-api-1.onrender.com`)

## Installation

```bash
git clone https://github.com/ArnavDasoju/vitimeasure-mobile.git
cd vitimeasure-mobile

npm install

# (iOS only) Install native pods
cd ios && pod install && cd ..

# Copy the env file and configure if needed
cp .env.example .env
```

The only mobile-side env var is `EXPO_PUBLIC_API_BASE_URL`. If unset, the app falls back to the production API.

## Usage

```bash
# Start the Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

Scan the QR code with Expo Go, or use a development build for full native module support (camera, notifications, etc.).

## Project Structure

```
app/
  (auth)/          Sign in, sign up, forgot password
  (onboarding)/    First-launch onboarding flow
  (tabs)/          Main tab navigator — Home, History, Reports, Settings
  scan/            Camera capture per body location
  results/         Scan results display
  report/          PDF report viewer
  patch/           Patch detail view
src/
  config.ts        API base URL, EAS project ID, SecureStore keys
  components/      Reusable UI components
  lib/             Auth, API client, local storage, formatting
  services/        Cloud sync, notifications, PDF export
  store/           Zustand global state
  theme/           Colors, typography, spacing, shadows
  types/           TypeScript type definitions
  utils/           VASI scoring, stress colors, correlation engine
```

## Configuration

| Variable | Description | Default |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend API base URL | `https://vitimeasure-api-1.onrender.com` |

## Development

```bash
# Type-check without emitting
npm run typecheck
```

## Tech Stack

- **React Native** 0.83 via **Expo** SDK 55
- **Expo Router** (file-based routing)
- **Zustand** for state management
- **React Native Reanimated** + **Gesture Handler** for animations
- **Expo SecureStore** for credential storage
- **@shopify/react-native-skia** for canvas rendering

## License

No LICENSE file is included in this repository. Contact the maintainers for licensing terms.
