# מערכת לוגואים דינמית - סיכום

## ✅ מה שבוצע

### 1. יצירת קובץ מיפוי לוגואים
- **קובץ**: `src/theme/assets.ts`
- **תפקיד**: מיפוי בין לקוחות ללוגואים שלהם
- **תכונות**:
  - זיהוי אוטומטי של הלקוח הפעיל
  - ברירת מחדל ל-`clientA` אם לא נמצא לקוח
  - פונקציות עזר לקבלת לוגו לפי לקוח

### 2. יצירת לוגואים לדוגמה
- **clientA**: `assets/images/clientA-logo.png` (העתק של logo-03.png)
- **clientB**: `assets/images/clientB-logo.png` (העתק של slotlys-02.png)
- **ברירת מחדל**: `assets/images/logo-03.png`

### 3. עדכון מסך בית הלקוח
- **קובץ**: `app/(client-tabs)/index.tsx`
- **שינוי**: החלפת הלוגו הסטטי בלוגו דינמי
- **מיקום**: בכותרת העליונה של המסך

### 4. עדכון מסך בית המנהל
- **קובץ**: `app/(tabs)/index.tsx`
- **שינוי**: החלפת הלוגו הסטטי בלוגו דינמי
- **מיקום**: בכותרת העליונה של המסך

### 5. הוספת סקריפטי בדיקה
- **קובץ**: `scripts/test-logos.mjs`
- **תפקיד**: בדיקת תקינות מערכת הלוגואים
- **פקודה**: `npm run test:logos`

### 6. עדכון package.json
- הוספת סקריפטים חדשים:
  - `start:clientA` - הרצה עם לקוח A
  - `start:clientB` - הרצה עם לקוח B
  - `start:web:clientA` - הרצה web עם לקוח A
  - `start:web:clientB` - הרצה web עם לקוח B
  - `test:logos` - בדיקת מערכת הלוגואים

## 🎯 איך זה עובד

### זיהוי הלקוח
```typescript
// המערכת מזהה את הלקוח לפי:
1. Constants.expoConfig?.extra?.CLIENT
2. process.env.CLIENT
3. ברירת מחדל: 'clientA'
```

### מיפוי הלוגואים
```typescript
const clientLogos = {
  clientA: require('../../assets/images/clientA-logo.png'),
  clientB: require('../../assets/images/clientB-logo.png'),
  default: require('../../assets/images/logo-03.png'),
};
```

### שימוש במסכים
```typescript
// במקום:
<Image source={require('@/assets/images/logo-03.png')} />

// עכשיו:
<Image source={getCurrentClientLogo()} />
```

## 🚀 איך להשתמש

### הרצה עם לקוח ספציפי
```bash
# לקוח A
npm run start:clientA

# לקוח B
npm run start:clientB

# ברירת מחדל
npm start
```

### בדיקת המערכת
```bash
# בדיקת לוגואים
npm run test:logos

# בדיקת theme
npm run test:theme
```

## 📁 קבצים שנוצרו/עודכנו

### קבצים חדשים:
- `src/theme/assets.ts` - מיפוי לוגואים
- `assets/images/clientA-logo.png` - לוגו לקוח A
- `assets/images/clientB-logo.png` - לוגו לקוח B
- `scripts/test-logos.mjs` - בדיקת לוגואים

### קבצים שעודכנו:
- `app/(client-tabs)/index.tsx` - מסך בית לקוח
- `app/(tabs)/index.tsx` - מסך בית מנהל
- `package.json` - סקריפטים חדשים
- `README.md` - תיעוד מעודכן

## 🎨 הוספת לקוח חדש

### שלב 1: הוסף לוגו
```bash
# העתק לוגו ל:
assets/images/newClient-logo.png
```

### שלב 2: עדכן את assets.ts
```typescript
export const clientLogos = {
  clientA: require('../../assets/images/clientA-logo.png'),
  clientB: require('../../assets/images/clientB-logo.png'),
  newClient: require('../../assets/images/newClient-logo.png'), // הוסף כאן
  default: require('../../assets/images/logo-03.png'),
};
```

### שלב 3: הוסף סקריפט
```json
{
  "scripts": {
    "start:newClient": "cross-env CLIENT=newClient expo start --tunnel"
  }
}
```

### שלב 4: הרץ
```bash
npm run start:newClient
```

## ✅ בדיקות שבוצעו

1. **בדיקת קבצים**: כל הלוגואים קיימים
2. **בדיקת imports**: כל הקבצים מייבאים נכון
3. **בדיקת שימוש**: שני המסכים משתמשים בלוגו דינמי
4. **בדיקת מיפוי**: assets.ts מכיל את כל הלוגואים

## 🎉 תוצאה

עכשיו האפליקציה מציגה לוגו שונה לכל לקוח:
- **clientA** → לוגו A
- **clientB** → לוגו B (Slotlys)
- **ברירת מחדל** → לוגו רגיל

הלוגו מתחלף אוטומטית במסכי הבית של הלקוח והמנהל בהתאם ללקוח הפעיל.
