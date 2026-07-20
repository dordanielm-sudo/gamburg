# פריסה ל-Cloudways

מדריך שלב-אחר-שלב להרצת ה-CRM על שרת Cloudways קיים. **הבדל קריטי מ-PHP/וורדפרס**:
Next.js לא "יושב בתיקייה" — הוא תהליך Node.js חי שרץ כל הזמן על פורט (3000),
ו-Nginx מעביר אליו תעבורה מפורט 80/443. אין "העלאת קבצים" בלבד.

## 0. מה צריך מוכן מראש

- גישת SSH לשרת Cloudways (מהדשבורד: Application → Access Details).
- דומיין/סאב-דומיין שמצביע לשרת.
- מ-Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (ראה `.env.example`).
- מ-Make (כשה-scenarios יהיו מוכנים): `MAKE_OUTGOING_WEBHOOK_URL`,
  ומחרוזת אקראית משלכם ל-`MAKE_INCOMING_WEBHOOK_SECRET` (אותה מחרוזת גם
  מוגדרת בצד Make כ-header בשם `x-webhook-secret`).

## 1. התקנה חד-פעמית על השרת

```bash
ssh master_<your-server>@<server-ip>

# Node.js דרך nvm (Cloudways לא מתקינים Node כברירת מחדל)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# PM2 - שומר על התהליך חי, מרים אותו מחדש אחרי קריסה/ריסטארט שרת
npm install -g pm2

# משיכת הקוד
cd ~/applications/<your-app-folder>/public_html   # או כל נתיב שתבחרו
git clone https://github.com/dordanielm-sudo/gamburg.git .
```

## 2. משתני סביבה

```bash
cp .env.example .env.production
nano .env.production   # למלא את הערכים האמיתיים
```

**קריטי:** `NEXT_PUBLIC_SUPABASE_URL` ו-`NEXT_PUBLIC_SUPABASE_ANON_KEY` נשרפים
לתוך קוד ה-JavaScript של הלקוח **בזמן `npm run build`**, לא בזמן ההרצה. אם
תשנו אותם מאוחר יותר, צריך `npm run build` מחדש (`scripts/deploy.sh` עושה
את זה אוטומטית).

`.env.production` **לא** נכנס ל-git (ראה `.gitignore`) - הוא נשאר רק על השרת.

## 3. הרצה ראשונה

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # מדפיס פקודה חד-פעמית שצריך להריץ (עם sudo) - מריץ PM2 אחרי ריבוט שרת
```

בדיקה שהתהליך רץ: `pm2 status` וגם `curl http://127.0.0.1:3000/login` (אמור
להחזיר HTML).

## 4. Nginx כ-reverse proxy

בדשבורד Cloudways: Application Management → **Nginx Configuration**. להוסיף
את הבלוק הבא (לא למחוק את מה שכבר קיים - להוסיף בתוך ה-`server` block הקיים):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

(`Upgrade`/`Connection` כאן חשובים ל-Supabase Realtime - פעמון ההתראות
מתחבר ב-WebSocket ישירות ל-Supabase מהדפדפן, לא דרך השרת שלכם, אז זה בעצם
לא קריטי ל-Realtime עצמו, אבל לא מזיק ותומך בכל מקרה עתידי שבו כן יהיה
WebSocket דרך השרת שלכם.)

שמירה, ואז מהדשבורד: **Restart** ל-Nginx/Application.

## 5. SSL

מהדשבורד Cloudways: Application → SSL Certificate → Let's Encrypt (חינמי),
לבחור את הדומיין. פועל מול Nginx בלי שינוי בקוד - כל עוד השלב הקודם תקין.

## 6. בדיקה

- `https://your-domain/login` נטען.
- מתחברים עם משתמש שהוזמן מ-Supabase, ומגיעים ל-`/cases`.
- `pm2 logs gamburg-crm` - לוודא שאין שגיאות בזמן שימוש.

## 7. פריסת עדכונים (בכל push חדש ל-main)

```bash
cd ~/applications/<your-app-folder>/public_html
./scripts/deploy.sh
```

עושה: `git pull` + `npm ci` + `npm run build` + `pm2 reload` - בלי downtime
משמעותי. שווה גם להריץ ידנית ראשונה פעם, ואז אפשר לחשוב על webhook
אוטומטי (GitHub → SSH) אם רוצים CI/CD מלא בהמשך.

## פתרון תקלות נפוצות

- **502 Bad Gateway** - התהליך של Node לא רץ (`pm2 status`) או ה-Nginx
  proxy_pass מפנה לפורט הלא נכון.
- **שינוי ב-.env.production לא משפיע** - צריך `npm run build` מחדש (לא רק
  restart), כי ה-`NEXT_PUBLIC_*` נשרפים ב-build.
- **`/api/webhooks/incoming-document` מחזיר 401 מ-Make** - לבדוק שה-header
  `x-webhook-secret` שהוגדר בתרחיש Make זהה בדיוק ל-`MAKE_INCOMING_WEBHOOK_SECRET`
  בשרת.

## אבטחה - תזכורת

ראה גם את `README.md` ו-`supabase/README.md`. הכי חשוב: **לא לשמור אף
ערך מה-`.env.production` בשום מקום שמתועד/משותף** - רק על השרת עצמו.
