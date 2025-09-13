# 🎨 Multi Brand White Label System

מערכת Multi Brand מתקדמת לניהול מספר לקוחות באותה אפליקציה עם מיתוג, צבעים ולוגואים שונים.

## 📁 מבנה התיקיות

```
branding/
├── clientA/                    # לקוח A
│   ├── app.config.json        # תצורת האפליקציה
│   ├── theme.json             # צבעים ומיתוג
│   ├── icon.png               # אייקון האפליקציה
│   ├── splash.png             # מסך פתיחה
│   ├── logo.png               # לוגו רגיל
│   └── logo-white.png         # לוגו לבן
├── clientB/                    # לקוח B
│   ├── app.config.json
│   ├── theme.json
│   ├── icon.png
│   ├── splash.png
│   ├── logo.png
│   └── logo-white.png
├── current.json               # הלקוח הנוכחי (נוצר אוטומטית)
└── ...

src/
├── config/
│   └── currentClient.ts       # הלקוח הפעיל (נוצר אוטומטית)
└── theme/
    ├── ThemeProvider.tsx      # ספק התמותה
    └── assets.ts              # מיפוי לוגואים

scripts/
├── build-client.mjs           # בניית אפליקציה
├── switch-client.mjs          # החלפת לקוח
├── add-client.mjs             # הוספת לקוח חדש
└── test-theme.mjs             # בדיקת המערכת
```

## 🚀 שימוש בסיסי

### 1. הרצת אפליקציה עם לקוח ספציפי

```bash
# הרצה עם clientA
npm run start:clientA

# הרצה עם clientB
npm run start:clientB

# הרצה ב-web
npm run start:web:clientA
```

### 2. החלפת לקוח

```bash
# החלפה לclientA
npm run switch:client clientA

# החלפה לclientB
npm run switch:client clientB
```

### 3. בניית אפליקציה

```bash
# בניית iOS
npm run build:clientA:ios
npm run build:clientB:ios

# בניית Android
npm run build:clientA:android
npm run build:clientB:android

# בניית הכל
npm run build:clientA:all
npm run build:clientB:all
```

## 🆕 הוספת לקוח חדש

### 1. יצירת לקוח חדש

```bash
npm run add:client clientC
```

זה יוצר:
- תיקייה `branding/clientC/`
- קבצי תצורה בסיסיים
- קבצי placeholder לתמונות
- עדכון `assets.ts`

### 2. התאמה אישית

1. **החלף קבצי התמונות:**
   ```
   branding/clientC/icon.png        # 1024x1024px
   branding/clientC/splash.png      # 1242x2436px
   branding/clientC/logo.png        # לוגו רגיל
   branding/clientC/logo-white.png  # לוגו לבן
   assets/images/clientC-logo.png   # לוגו לכותרת
   ```

2. **התאם את הצבעים ב-`theme.json`:**
   ```json
   {
     "colors": {
       "primary": "#FF6B6B",
       "secondary": "#4ECDC4",
       "background": "#FFFFFF",
       "text": "#2C3E50"
     },
     "branding": {
       "companyName": "My Company",
       "website": "https://mycompany.com",
       "supportEmail": "support@mycompany.com"
     }
   }
   ```

3. **התאם את פרטי האפליקציה ב-`app.config.json`:**
   ```json
   {
     "expo": {
       "name": "My Company App",
       "slug": "my-company-app",
       "ios": {
         "bundleIdentifier": "com.mycompany.app"
       },
       "android": {
         "package": "com.mycompany.app"
       }
     }
   }
   ```

### 3. הוספת סקריפטים ל-package.json

```json
{
  "scripts": {
    "start:clientC": "cross-env CLIENT=clientC node app.config.js && cross-env CLIENT=clientC expo start --tunnel",
    "build:clientC:ios": "cross-env CLIENT=clientC node scripts/build-client.mjs clientC ios",
    "build:clientC:android": "cross-env CLIENT=clientC node scripts/build-client.mjs clientC android"
  }
}
```

## 🎨 שימוש בתמותה בקוד

### 1. שימוש בצבעים

```tsx
import { useColors } from '@/src/theme/ThemeProvider';

function MyComponent() {
  const colors = useColors();
  
  return (
    <View style={{ backgroundColor: colors.primary }}>
      <Text style={{ color: colors.text }}>Hello World</Text>
    </View>
  );
}
```

### 2. שימוש במיתוג

```tsx
import { useBranding } from '@/src/theme/ThemeProvider';

function Header() {
  const branding = useBranding();
  
  return (
    <View>
      <Text>{branding.companyName}</Text>
      <Text>{branding.website}</Text>
    </View>
  );
}
```

### 3. שימוש בלוגו

```tsx
import { getCurrentClientLogo } from '@/src/theme/assets';

function Logo() {
  return (
    <Image 
      source={getCurrentClientLogo()} 
      style={{ width: 100, height: 50 }}
    />
  );
}
```

## 🔧 בדיקת המערכת

### 1. בדיקת תמותה

```bash
npm run test:theme
```

### 2. בדיקת לוגואים

```bash
npm run check:logo
```

### 3. בדיקת החלפת לקוחות

```bash
npm run switch:client clientA
npm run check:logo
npm run switch:client clientB
npm run check:logo
```

## 📱 דוגמאות לקוחות

### ClientA (Light Theme)
- **צבעים:** כחול (#007AFF), רקע לבן
- **לוגו:** clientA-logo.png
- **Bundle ID:** com.clienta.app

### ClientB (Dark Theme)
- **צבעים:** סגול (#7B61FF), רקע כהה
- **לוגו:** clientB-logo.png
- **Bundle ID:** com.clientb.app

## 🚨 פתרון בעיות

### 1. לוגו לא מופיע
- בדוק שקובץ הלוגו קיים ב-`assets/images/`
- ודא שהקובץ נוסף ל-`assets.ts`
- הרץ `npm run check:logo`

### 2. צבעים לא משתנים
- בדוק ש-`ThemeProvider` עוטף את האפליקציה
- ודא שהתמותה נטענת מ-`Constants.expoConfig.extra.theme`
- הרץ `npm run test:theme`

### 3. בנייה נכשלת
- ודא שכל הקבצים הנדרשים קיימים
- בדוק שה-bundle ID ייחודי
- הרץ `npm run build:clientA:ios` לבדיקה

## 🎯 טיפים מתקדמים

### 1. שימוש בסביבות שונות
```bash
# Development
CLIENT=clientA npm start

# Production build
CLIENT=clientA npm run build:clientA:ios
```

### 2. אוטומציה עם CI/CD
```yaml
# GitHub Actions example
- name: Build Client A
  run: |
    npm run switch:client clientA
    npm run build:clientA:all
```

### 3. ניהול גרסאות
- כל לקוח יכול להיות בגרסה שונה
- עדכן את `version` ב-`app.config.json`
- השתמש ב-`buildNumber` ל-iOS ו-`versionCode` ל-Android

## 📞 תמיכה

לשאלות או בעיות:
1. הרץ `npm run test:theme` לבדיקה כללית
2. בדוק את הלוגים בקונסול
3. ודא שכל הקבצים הנדרשים קיימים
4. נסה להחליף לקוח עם `npm run switch:client`

---

**🎉 המערכת מוכנה לשימוש!** כל לקוח יקבל אפליקציה ממותגת משלו עם אותו קוד בסיס.
