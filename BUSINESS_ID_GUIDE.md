# 🏢 Business ID System - מדריך מלא

מערכת Business ID מאפשרת לכל לקוח לעבוד עם נתונים נפרדים בדאטהבייס, כך שכל לקוח רואה רק את הנתונים שלו.

## 📁 מבנה המערכת

```
branding/
├── clientA/
│   ├── .env                    # משתני סביבה לclientA
│   ├── app.config.json        # תצורת האפליקציה
│   ├── theme.json             # צבעים ומיתוג
│   └── assets/                # קבצי עיצוב
├── clientB/
│   ├── .env                    # משתני סביבה לclientB
│   ├── app.config.json
│   ├── theme.json
│   └── assets/
└── current.json               # הלקוח הנוכחי (נוצר אוטומטית)

eas.json                       # פרופילי בנייה לכל לקוח
lib/supabase.ts               # טעינת BUSINESS_ID
```

## 🔧 קבצי .env לכל לקוח

### clientA/.env
```env
# Client A Environment Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
BUSINESS_ID=client-a-business-id-12345
CLIENT_NAME=clientA
```

### clientB/.env
```env
# Client B Environment Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
BUSINESS_ID=client-b-business-id-67890
CLIENT_NAME=clientB
```

## 🚀 שימוש במערכת

### 1. החלפת לקוח
```bash
npm run switch:client clientA    # החלפה לclientA
npm run switch:client clientB    # החלפה לclientB
```

### 2. הרצת אפליקציה
```bash
npm run start:clientA           # הרצה עם clientA
npm run start:clientB           # הרצה עם clientB
```

### 3. בניית אפליקציה
```bash
# בניית iOS
npm run build:clientA:ios
npm run build:clientB:ios

# בניית Android
npm run build:clientA:android
npm run build:clientB:android

# בניית עם EAS
eas build --profile clientA --platform ios
eas build --profile clientB --platform android
```

## 💻 שימוש בקוד

### 1. קבלת BUSINESS_ID
```typescript
import { getBusinessId } from '@/lib/supabase';

const businessId = getBusinessId();
console.log('Current business ID:', businessId);
```

### 2. שימוש ב-Supabase עם BUSINESS_ID
```typescript
import { supabase, getBusinessId } from '@/lib/supabase';

// קריאה עם פילטר business_id
const { data: users } = await supabase
  .from('users')
  .select('*')
  .eq('business_id', getBusinessId());

// כתיבה עם business_id
const { data: newUser } = await supabase
  .from('users')
  .insert({
    name: 'John Doe',
    phone: '+1234567890',
    business_id: getBusinessId() // חשוב!
  });
```

### 3. שימוש ב-Constants
```typescript
import Constants from 'expo-constants';

const businessId = Constants.expoConfig?.extra?.BUSINESS_ID;
const client = Constants.expoConfig?.extra?.CLIENT;
```

## 🗄️ מבנה הדאטהבייס

כל טבלה חייבת לכלול שדה `business_id`:

### טבלת users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('admin', 'client')),
  business_id TEXT NOT NULL,  -- חשוב!
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### טבלת appointments
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  business_id TEXT NOT NULL,  -- חשוב!
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### טבלת services
```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  business_id TEXT NOT NULL,  -- חשוב!
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🔒 Row Level Security (RLS)

מומלץ להגדיר RLS כדי להבטיח שכל לקוח רואה רק את הנתונים שלו:

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Policy for users table
CREATE POLICY "Users can only see their business data" ON users
  FOR ALL USING (business_id = current_setting('app.business_id'));

-- Policy for appointments table
CREATE POLICY "Users can only see their business appointments" ON appointments
  FOR ALL USING (business_id = current_setting('app.business_id'));

-- Policy for services table
CREATE POLICY "Users can only see their business services" ON services
  FOR ALL USING (business_id = current_setting('app.business_id'));
```

## 🧪 בדיקת המערכת

### 1. בדיקת business_id
```bash
npm run test:business-id
```

### 2. בדיקת תמותה
```bash
npm run test:theme
```

### 3. בדיקת החלפת לקוחות
```bash
npm run switch:client clientA
npm run test:business-id
npm run switch:client clientB
npm run test:business-id
```

## 🆕 הוספת לקוח חדש

### 1. יצירת לקוח
```bash
npm run add:client myNewClient
```

זה יוצר:
- תיקיית מיתוג מלאה
- קובץ .env עם BUSINESS_ID ייחודי
- קבצי תצורה בסיסיים
- קבצי placeholder לתמונות

### 2. התאמה אישית
1. **עדכן .env:**
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-actual-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
   EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
   BUSINESS_ID=my-unique-business-id-12345
   ```

2. **החלף קבצי תמונות:**
   - `icon.png` (1024x1024px)
   - `splash.png` (1242x2436px)
   - `logo.png`
   - `logo-white.png`

3. **התאם תמותה:**
   ```json
   {
     "colors": {
       "primary": "#FF6B6B",
       "secondary": "#4ECDC4"
     },
     "branding": {
       "companyName": "My Company",
       "website": "https://mycompany.com"
     }
   }
   ```

### 3. הוספת סקריפטים
```json
{
  "scripts": {
    "start:myNewClient": "cross-env CLIENT=myNewClient node app.config.js && cross-env CLIENT=myNewClient expo start --tunnel",
    "build:myNewClient:ios": "cross-env CLIENT=myNewClient node scripts/build-client.mjs myNewClient ios",
    "build:myNewClient:android": "cross-env CLIENT=myNewClient node scripts/build-client.mjs myNewClient android"
  }
}
```

## 🔧 פתרון בעיות

### 1. BUSINESS_ID לא מופיע
- בדוק שקובץ .env קיים בתיקיית הלקוח
- ודא שה-BUSINESS_ID מוגדר בקובץ .env
- הרץ `npm run switch:client <clientName>`

### 2. נתונים מתערבבים בין לקוחות
- ודא שכל טבלה כוללת שדה `business_id`
- בדוק שה-RLS מוגדר נכון
- ודא שכל קריאה ל-Supabase כוללת פילטר `business_id`

### 3. בנייה נכשלת
- בדוק שה-EAS profile קיים ב-eas.json
- ודא שקובץ .env קיים בתיקיית הלקוח
- בדוק שה-Bundle ID ייחודי לכל לקוח

## 📊 דוגמאות שימוש

### 1. רשימת משתמשים לפי לקוח
```typescript
const getUsersForCurrentBusiness = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('business_id', getBusinessId());
  
  if (error) throw error;
  return data;
};
```

### 2. יצירת תור חדש
```typescript
const createAppointment = async (appointmentData) => {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      ...appointmentData,
      business_id: getBusinessId() // חשוב!
    });
  
  if (error) throw error;
  return data;
};
```

### 3. רשימת שירותים
```typescript
const getServicesForCurrentBusiness = async () => {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', getBusinessId())
    .eq('is_active', true);
  
  if (error) throw error;
  return data;
};
```

## 🎯 סיכום

המערכת מאפשרת:
- ✅ **בידוד נתונים** - כל לקוח רואה רק את הנתונים שלו
- ✅ **מיתוג נפרד** - כל לקוח עם עיצוב וצבעים שונים
- ✅ **בנייה נפרדת** - כל לקוח עם Bundle ID ייחודי
- ✅ **ניהול קל** - החלפת לקוחות בפקודה אחת
- ✅ **בטיחות** - RLS מונע גישה לנתונים של לקוחות אחרים

---

**🎉 המערכת מוכנה לשימוש!** כל לקוח יעבוד עם הנתונים שלו בלבד.
