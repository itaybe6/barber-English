# White-Label Multi-Brand Setup

This document explains how to use the white-label multi-brand system that has been implemented in your app.

## 🎯 Overview

Your app now supports multiple clients with different branding, colors, and configurations. Each client can have:
- Custom app name and bundle identifiers
- Unique color schemes
- Custom logos and splash screens
- Different company information

## 📁 File Structure

```
branding/
├── clientA/
│   ├── app.config.json      # App configuration for Client A
│   ├── theme.json           # Colors and branding for Client A
│   ├── icon.png             # App icon for Client A
│   └── splash.png           # Splash screen for Client A
├── clientB/
│   ├── app.config.json      # App configuration for Client B
│   ├── theme.json           # Colors and branding for Client B
│   ├── icon.png             # App icon for Client B
│   └── splash.png           # Splash screen for Client B
└── current.json             # Current client config (auto-generated)

src/theme/
└── ThemeProvider.tsx        # Theme context provider

scripts/
├── build-client.mjs         # Build script for specific clients
└── test-theme.mjs           # Test script to verify setup

app.config.js                # Dynamic app configuration
```

## 🚀 Usage

### Development

Run the app with a specific client:
```bash
# Run with Client A
CLIENT=clientA npm start

# Run with Client B
CLIENT=clientB npm start

# Run with default client
npm start
```

### Building

Build apps for specific clients:
```bash
# Build Client A for iOS
npm run build:clientA:ios

# Build Client A for Android
npm run build:clientA:android

# Build Client A for both platforms
npm run build:clientA:all

# Build Client B for iOS
npm run build:clientB:ios

# Build Client B for Android
npm run build:clientB:android

# Build Client B for both platforms
npm run build:clientB:all

# Custom build
node scripts/build-client.mjs <client> <platform> <buildProfile>
```

### Testing

Test the theme system:
```bash
npm run test:theme
```

## 🎨 Adding a New Client

1. **Create client directory:**
   ```bash
   mkdir branding/newClient
   ```

2. **Create app.config.json:**
   ```json
   {
     "expo": {
       "name": "New Client App",
       "slug": "new-client-app",
       "version": "1.0.0",
       "icon": "./branding/newClient/icon.png",
       "splash": {
         "image": "./branding/newClient/splash.png",
         "backgroundColor": "#ffffff"
       },
       "ios": {
         "bundleIdentifier": "com.newclient.app"
       },
       "android": {
         "package": "com.newclient.app"
       }
     }
   }
   ```

3. **Create theme.json:**
   ```json
   {
     "colors": {
       "primary": "#FF6B6B",
       "secondary": "#4ECDC4",
       "background": "#FFFFFF",
       "text": "#333333"
     },
     "branding": {
       "companyName": "New Client",
       "website": "https://newclient.com",
       "supportEmail": "support@newclient.com"
     }
   }
   ```

4. **Add assets:**
   - `icon.png` - App icon (1024x1024 recommended)
   - `splash.png` - Splash screen (1242x2436 recommended)

5. **Add build scripts to package.json:**
   ```json
   {
     "scripts": {
       "build:newClient:ios": "node scripts/build-client.mjs newClient ios",
       "build:newClient:android": "node scripts/build-client.mjs newClient android",
       "build:newClient:all": "node scripts/build-client.mjs newClient all"
     }
   }
   ```

## 🎨 Using Themes in Components

### Basic Usage

```tsx
import { useTheme, useColors, useBranding } from '@/src/theme/ThemeProvider';

const MyComponent = () => {
  const { theme, client } = useTheme();
  const colors = useColors();
  const branding = useBranding();

  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.text }}>
        Welcome to {branding.companyName}
      </Text>
    </View>
  );
};
```

### Using ThemedButton Component

```tsx
import { ThemedButton } from '@/components/ThemedButton';

const MyScreen = () => {
  return (
    <View>
      <ThemedButton
        title="Primary Action"
        onPress={() => console.log('Pressed')}
        variant="primary"
        size="large"
      />
    </View>
  );
};
```

## 🔧 Configuration Files

### app.config.json Structure

```json
{
  "expo": {
    "name": "App Name",
    "slug": "app-slug",
    "version": "1.0.0",
    "icon": "./branding/client/icon.png",
    "splash": {
      "image": "./branding/client/splash.png",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "com.client.app"
    },
    "android": {
      "package": "com.client.app"
    }
  }
}
```

### theme.json Structure

```json
{
  "colors": {
    "primary": "#007AFF",
    "secondary": "#5856D6",
    "accent": "#FF3B30",
    "background": "#FFFFFF",
    "surface": "#F2F2F7",
    "text": "#1C1C1E",
    "textSecondary": "#8E8E93",
    "border": "#E5E5EA",
    "success": "#34C759",
    "warning": "#FF9500",
    "error": "#FF3B30",
    "info": "#007AFF"
  },
  "branding": {
    "logo": "./branding/client/logo.png",
    "logoWhite": "./branding/client/logo-white.png",
    "companyName": "Client Name",
    "website": "https://client.com",
    "supportEmail": "support@client.com"
  },
  "fonts": {
    "primary": "System",
    "secondary": "System"
  }
}
```

## 🚨 Important Notes

1. **Bundle Identifiers:** Each client must have unique bundle identifiers for iOS and Android
2. **Assets:** Make sure to provide proper icon and splash screen assets for each client
3. **Testing:** Always test with `npm run test:theme` after adding new clients
4. **Build Process:** The build script automatically uses the correct client configuration
5. **Environment Variables:** The `CLIENT` environment variable determines which client configuration to use

## 🎯 Next Steps

1. Add your actual client assets (icons, splash screens)
2. Customize the theme.json files for each client
3. Test the system with `npm run test:theme`
4. Build and test apps for each client
5. Deploy to app stores with client-specific configurations

## 🆘 Troubleshooting

### Common Issues

1. **"Client not found" error:**
   - Make sure the client directory exists in `branding/`
   - Check that `app.config.json` and `theme.json` exist

2. **Build failures:**
   - Verify bundle identifiers are unique
   - Check that all required assets exist
   - Run `npm run test:theme` to verify setup

3. **Theme not loading:**
   - Check that ThemeProvider is wrapped around your app
   - Verify theme.json has valid JSON structure
   - Check console for theme loading errors

### Getting Help

- Run `npm run test:theme` to diagnose issues
- Check the console for error messages
- Verify all required files exist in the client directory
- Ensure bundle identifiers are unique across all clients
