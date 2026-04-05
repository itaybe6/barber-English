import type { TFunction } from 'i18next';

/** Maps auth-phone-otp Edge error codes to localized messages (login + login-otp). */
export function otpErrorMessage(t: TFunction, code: string | undefined): string {
  switch (code) {
    case 'pulseem_not_configured':
      return t(
        'login.otp.errorPulseem',
        'שליחת SMS לא הוגדרה: נדרשים מזהה משתמש, סיסמה ומספר שולח פולסים (Web Service). מפתח API בלבד לא מספיק — הגדר בסופר־אדמין.',
      );
    case 'business_not_found':
      return t('login.otp.errorBusiness', 'מזהה העסק לא נמצא במסד. בדוק BUSINESS_ID ב-.env.');
    case 'db_error':
    case 'server_error':
      return t(
        'login.otp.errorServer',
        'שגיאת שרת. ודא מיגרציית OTP והפונקציה auth-phone-otp ב-Supabase.',
      );
    case 'invoke_network':
      return t('login.otp.errorInvoke', 'לא ניתן להגיע לשרת (Edge Function). בדוק פריסה ואינטרנט.');
    case 'rate_limit_sends':
      return t('login.otp.errorRateLimit', 'נשלחו יותר מדי קודים לשעה. נסה שוב מאוחר יותר.');
    case 'pulseem_monthly_quota_exceeded':
      return t(
        'login.otp.errorMonthlyQuota',
        'הגעת למכסת הודעות SMS החודשית של העסק. נסה שוב בחודש הבא או פנה לתמיכה.',
      );
    case 'sms_send_failed':
      return t('login.otp.errorSms', 'שליחת ה-SMS נכשלה. נסה שוב.');
    case 'wrong_code':
    case 'no_active_code':
      return t('login.otp.errorWrongCode', 'קוד שגוי או שפג תוקפו. בקש קוד חדש.');
    case 'too_many_attempts':
      return t('login.otp.errorTooMany', 'יותר מדי ניסיונות שגויים. בקש קוד חדש.');
    case 'phone_registered':
      return t('register.phoneExists.message', 'מספר זה כבר רשום.');
    case 'phone_not_registered':
      return t(
        'login.otp.errorPhoneNotRegistered',
        'מספר הטלפון אינו רשום אצלנו. ניתן להירשם בעמוד ההרשמה.',
      );
    default:
      return code && code !== 'send_failed'
        ? `${t('common.retry', 'נסה שוב')} (${code})`
        : t('common.tryAgain', 'אירעה שגיאה, נסה שוב');
  }
}
