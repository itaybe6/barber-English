# 📋 מדריך בדיקה מקיף - קרוסלה וגרירה

## תנאים מוקדמים
- ✅ Android Emulator או iOS Simulator פועל
- ✅ אפליקציה מבנויה ורצה (`npx expo start`)
- ✅ משתמש מחובר (יש account)

---

## בדיקה 1: ניווט בין שלבים (Step Navigation)

### שלב 1 → שלב 2 (סקרול למטה)
```
✓ פתח את מסך קביעת התור
✓ בחר ספר (לחץ על תמונה / גלול אופקי)
✓ כעת אתה בשלב 1
✓ גלול למטה בעדינות
⚠️ צפוי: מעבר חלק לשלב 2 (בחירת שירות)
⚠️ סף הגלילה: y > 8 (די רגיש)
```

**צו"ק (Expected Behavior):**
- אנימציית fade-out של Step 1
- אנימציית fade-in של ServiceCarouselSelector
- בחירת הספר נשמרת

---

## בדיקה 2: קרוסלה שירותים (Service Carousel)

### הגלילה האופקית חייבת לעבוד

```
✓ אתה בשלב 2 (Service Selection)
✓ בחן את הקרוסלה בחלק התחתון
✓ גלול שמאלה → שירות הבא
✓ גלול ימינה → שירות קודם
```

**צו"ק:**
- ✅ Snap חלק לכל פריט
- ✅ שם השירות מתעדכן בתחתית
- ✅ תמונת רקע מתחלפת עם fade
- ✅ אפקט Scale (התאמה גודל של הפריט המרוכז)
- ✅ Index מתעדכן (מופיע בקונסול: `console.log(clamped)`)

**נקודות חשובות:**
- `snapToInterval={SERVICE_ITEM}` = `84px` (68 + 16)
- `decelerationRate="fast"` → עצירה מהירה
- `contentContainerStyle={{ paddingHorizontal: (width - 84) / 2 }}` → ממורכזת

---

## בדיקה 3: ניווט אנכי בשלב 2

### A: גרירה למעלה → חזרה לשלב 1

```
✓ בשלב 2 (Service Selection)
✓ גרור למעלה בעדינות
```

**צו"ק:**
- ✅ אנימציית fade-out של Step 2
- ✅ חזרה לשלב 1 (BarberCarouselSelector)
- ✅ בחירת הספר נשמרת
- ⚠️ סף: `y < -8` (כמה פיקסלים למעלה)

### B: גרירה למטה → קדימה לשלב 3

```
✓ בשלב 2, בחר שירות (scroll להשתנות)
✓ גרור למטה בעדינות
```

**צו"ק:**
- ✅ אנימציית fade-out של Step 2
- ✅ מעבר לשלב 3 (בחירת יום - Day Selection)
- ✅ בחירת הספר והשירות נשמרות
- ⚠️ סף: `y > 16` (כמה פיקסלים למטה)
- ⚠️ דרישה: שירות חייב להיות בחור

---

## בדיקה 4: אי-הפרעה בין Horizontal ו-Vertical

### ✅ FlatList לא צריכה להיחסום

```
✓ בשלב 2, בצע גלילה אופקית בקרוסלה
✓ השם של השירות צריך להשתנות
✓ אנא וודא: אין "קפיצה" בשמירת הבחירה
```

**ירוק: (No PanResponder blocking)**
- `nestedScrollEnabled={true}` ← מתאפשר עכשיו
- ScrollView `onScroll` callback מטפל בvertical בלבד
- PanResponder הוסרה ← אין חסימה

---

## בדיקה 5: תיקום Step 2 Transitions

### בדוק את הספים החדשים

| פעולה | סף ישן | סף חדש | תוצאה |
|-------|--------|--------|--------|
| scroll up | y < -20 | y < -8 | 🟢 יותר רגיש |
| scroll down | y > 20 | y > 16 | 🟢 יותר רגיש |

**בדיקה:**
- ✓ גלול למעלה/למטה בעדינות יותר
- ✓ צפוי: תגובה מהירה יותר

---

## בדיקה 6: השוואה Barber vs Service

### Barber Carousel (Reference - עובד)
```
✓ Step 1, scroll אופקי בספרים
✓ שם מתעדכן + רקע מתחלף
✓ Smooth snapping
```

### Service Carousel (Fixed - צריך להיות זהה)
```
✓ Step 2, scroll אופקי בשירותים
✓ שם מתעדכן + רקע מתחלף ✅ (תיקון חדש)
✓ Smooth snapping ✅ (תיקון חדש)
```

---

## בדיקה 7: Edge Cases

### Case A: בחר שירות, אם לא - צפה לגרירה
```
⚠️ בדיקה: גרור למטה ללא בחירת שירות
✓ צפוי: כלום לא קורה (תנאי: `selectedService && ...`)
✓ לאחר בחירת שירות → גרירה למטה תעבוד
```

### Case B: מעבר מ-Step 3 חזרה ל-Step 1
```
✓ Step 3, לחץ "Back" button
✓ חוזר ל-Step 2 (Service Selection)
✓ שירות נשמר, גלול אופקי עדיין עובד
```

### Case C: Rapid swipes
```
✓ ביצוע גלילות מהירות בקרוסלה
✓ צפוי: Snap מהיר וחלק, לא קפיצות
```

---

## Debugging Tips 🐛

### Console Logs (add if needed):
```javascript
// In handleScrollTransitions:
console.log('currentStep:', currentStep, 'y:', y);

// In ServiceCarouselSelector onMomentumScrollEnd:
console.log('Service index changed:', clamped, 'service:', services[clamped]?.name);
```

### React Native Inspector:
```
⌘D (Mac) or Ctrl+M (Android) → Debug → Inspect Element
```

### Gesture Debugging:
```javascript
// Check if PanResponder is really removed:
// Search for "step2Pan" in the file
// Result: Should NOT be found ✅
```

---

## Pass/Fail Criteria ✅

### PASS:
- ✅ קרוסלה שירותים מחליפה בגלילה אופקית
- ✅ גרירה למעלה בStep 2 → חוזר לStep 1
- ✅ גרירה למטה בStep 2 (עם שירות) → Step 3
- ✅ אנימציות חלקות, אין קפיצות
- ✅ כלום לא נשבר בStep 1 או Step 3
- ✅ בחירות נשמרות בין שלבים

### FAIL:
- ❌ קרוסלה שירותים נתקעת
- ❌ מחוות אנכיות לא עובדות
- ❌ קפיצות או פגיעות בפרפורמנס
- ❌ PanResponder עדיין משפיעה (search code)
- ❌ `nestedScrollEnabled` עדיין `false`

---

## סיכום בדיקה

תאריך: _____________
בודק: _____________

| בדיקה | סטטוס |
|-------|--------|
| Step 1 → Step 2 | ☐ Pass ☐ Fail |
| Service Carousel Horizontal | ☐ Pass ☐ Fail |
| Step 2 → Step 1 (Swipe Up) | ☐ Pass ☐ Fail |
| Step 2 → Step 3 (Swipe Down) | ☐ Pass ☐ Fail |
| No Interference (H+V) | ☐ Pass ☐ Fail |
| New Thresholds (y<-8, y>16) | ☐ Pass ☐ Fail |
| Edge Cases | ☐ Pass ☐ Fail |
| Barber vs Service Consistency | ☐ Pass ☐ Fail |

**סיכום כללי:** ☐ All Pass ☐ Some Issues ☐ Blocked

---

**הערות נוספות:**
_________________________________
_________________________________
_________________________________
