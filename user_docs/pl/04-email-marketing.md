# E-mail marketing

## Przeglad

Marketing AI Assistant zawiera kompletny system e-mail marketingu. Mozesz zarzadzac listami subskrybentow, tworzyc kampanie e-mailowe, wysylac e-maile i sledzic wyniki — wszystko w ramach projektu.

## Konfiguracja e-mail

### Dodawanie konta e-mail

Przed wysylka e-maili musisz podlaczyc konto e-mail:

1. Przejdz do **Ustawienia > Konta e-mail**
2. Kliknij **Dodaj konto**
3. Wybierz dostawce:

**SMTP (dla wlasnych serwerow e-mail):**
- Adres e-mail (nadawca)
- Nazwa wyswietlana
- Host SMTP (np. smtp.gmail.com)
- Port SMTP (np. 587)
- Login i haslo

**Resend (nowoczesne API e-mail):**
- Adres e-mail (nadawca)
- Nazwa wyswietlana
- Klucz API z konta Resend

4. Kliknij **Zapisz**

Dane logowania sa szyfrowane i bezpiecznie przechowywane.

### Testowanie z MailHog (Srodowisko deweloperskie)

W trybie deweloperskim e-maile sa przechwytywane przez MailHog:
- E-maile sa wysylane na SMTP MailHog na porcie 1025
- Przegladaj wszystkie wyslane e-maile pod adresem **http://localhost:8025**
- Zadne e-maile nie sa faktycznie dostarczane do odbiorcow

Idealne do testowania kampanii e-mailowych bez wysylania prawdziwych e-maili.

## Zarzadzanie listami subskrybentow

### Tworzenie listy mailingowej

1. Otworz swoj projekt
2. Przejdz do sekcji **E-mail**
3. Kliknij **Nowa lista**
4. Wprowadz nazwe i opis
5. Kliknij **Utworz**

### Dodawanie subskrybentow

1. Otworz liste mailingowa
2. Kliknij **Dodaj subskrybenta**
3. Wprowadz:
   - **E-mail** — adres e-mail subskrybenta
   - **Imie** — imie subskrybenta (opcjonalnie)
4. Kliknij **Dodaj**

Jesli subskrybent z tym samym e-mailem juz istnieje na liscie, jego informacje zostana zaktualizowane.

### Statusy subskrybentow

| Status | Znaczenie |
|--------|----------|
| Aktywny | Moze otrzymywac e-maile |
| Wypisany | Zrezynowal przez link wypisania |
| Odrzucony (Bounce) | Trwaly blad dostarczenia |

## Wysylanie kampanii e-mailowych

### Tworzenie kampanii e-mailowej

1. Przejdz do sekcji **E-mail** projektu
2. Kliknij **Wyslij kampanie**
3. Wypelnij:
   - **Kampania** — wybierz kampanie
   - **Konto e-mail** — z ktorego konta wysylac
   - **Lista subskrybentow** — do kogo wysylac
   - **Temat** — temat e-maila
   - **Zawartosc HTML** — tresc e-maila

### Uzycie symboli zastepcych

W HTML e-maila mozesz uzyc symboli zastepcych, ktore sa automatycznie zastepowane dla kazdego subskrybenta:

| Symbol zastepczy | Zastapiony przez | Przyklad |
|-----------------|-----------------|---------|
| `{{email}}` | E-mail subskrybenta | jan@example.com |
| `{{unsubscribe_url}}` | Unikalny link wypisania | https://api.example.com/email/unsubscribe/abc123 |

**Wazne:** Zawsze dolaczaj `{{unsubscribe_url}}` w swoich e-mailach. Jest to wymagane przez przepisy i dobre praktyki e-mail marketingu.

### Przyklad HTML e-maila

```html
<html>
<body>
  <h1>Miesieczny newsletter</h1>
  <p>Witaj {{email}},</p>
  <p>Oto najwazniejsze wydarzenia marketingowe tego miesiaca...</p>

  <hr>
  <p style="font-size: 12px; color: #666;">
    Nie chcesz otrzymywac tych e-maili?
    <a href="{{unsubscribe_url}}">Wypisz sie</a>
  </p>
</body>
</html>
```

### Wysylanie

1. Przejrzyj tresc e-maila i liste odbiorcow
2. Kliknij **Wyslij**
3. System wysyla indywidualne e-maile do kazdego aktywnego subskrybenta
4. Kazdy subskrybent otrzymuje spersonalizowany e-mail z wlasnym linkiem wypisania
5. Statystyki kampanii sa rejestrowane

## Proces wypisania

Gdy subskrybent kliknie link wypisania:
1. Zostaje przekierowany na endpoint wypisania
2. Status zmienia sie z **Aktywny** na **Wypisany**
3. Nie bedzie juz otrzymywal e-maili z tej listy
4. Data wypisania jest zapisywana

## Sekwencje e-mail (kampanie drip)

Sekwencje e-mail pozwalaja wysylac automatyczne wieloetapowe serie wiadomosci do subskrybentow.

### Tworzenie sekwencji

1. Przejdz do sekcji **Sekwencje** w projekcie
2. Kliknij **Nowa sekwencja**
3. Skonfiguruj:
   - **Nazwa** — nazwa sekwencji
   - **Wyzwalacz** — kiedy rozpoczac sekwencje:

| Wyzwalacz | Opis |
|-----------|------|
| SIGNUP | Automatyczne uruchomienie po dolaczeniu subskrybenta do listy |
| MANUAL | Reczne zapisywanie wybranych subskrybentow |
| EVENT | Wyzwalane przez zdarzenie analityczne (np. rozpoczecie triala) |

4. Kliknij **Utworz**

### Dodawanie kroków

1. Otworz sekwencje
2. Kliknij **Dodaj krok**
3. Dla kazdego kroku ustaw:
   - **Temat** — temat e-maila
   - **Tresc** — zawartosc HTML e-maila
   - **Opoznienie** — liczba godzin oczekiwania przed wyslaniem (0 = natychmiast)
4. Kroki sa wykonywane kolejno z okreslonym opoznieniem miedzy nimi

### Zapisywanie subskrybentow

1. Otworz sekwencje
2. Kliknij **Zapisz**
3. Wprowadz adres e-mail subskrybenta
4. Subskrybent zaczyna otrzymywac e-maile zgodnie z wyzwalaczem i opoznieniami kroków

### Wbudowane szablony

| Szablon | Kroki | Zastosowanie |
|---------|-------|-------------|
| Seria powitalna | 5 e-maili | Onboarding nowego uzytkownika |
| Nurturing trialu | 7 e-maili | Konwersja trialu na platny plan |
| Re-engagement | 3 e-maile | Reaktywacja nieaktywnych uzytkownikow |

## Szablony e-mail

### Przegladanie szablonow

1. Przejdz do **Szablony** w glownej nawigacji
2. Przegladaj dostepne szablony e-mail wedlug kategorii
3. Podglad szablonow przed uzyciem

### Uzycie szablonu

1. Wybierz szablon
2. HTML szablonu zostanie zaladowany do edytora
3. Dostosuj tresc do swojej kampanii
4. Dodaj symbole zastepce (`{{email}}`, `{{unsubscribe_url}}`)
5. Wyslij

## Limity planow

| Plan | E-maili miesiecznie |
|------|-------------------|
| FREE | 100 |
| PRO | 5 000 |
| ENTERPRISE | 50 000 |

## Najlepsze praktyki

- **Zawsze dolaczaj link wypisania** — wymagane przez przepisy
- **Testuj przez MailHog** przed wysylka do prawdziwych subskrybentow
- **Segmentuj listy** — tworzenie oddzielnych list dla roznych odbiorcow
- **Personalizuj** — uzywaj symboli zastepcych
- **Monitoruj bounce** — usuwaj odrzuconych subskrybentow
- **Pisz jasne tematy** — od nich zalezy, czy e-mail zostanie otwarty
