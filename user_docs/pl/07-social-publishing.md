# Publikacja w mediach spolecznosciowych

## Przeglad

Marketing AI Assistant umozliwia publikowanie tresci bezposrednio na platformach spolecznosciowych z poziomu aplikacji. Podlacz swoje konta spolecznosciowe raz, a nastepnie publikuj zatwierdzone tresci kilkoma kliknieciami.

## Obslugiwane platformy

| Platforma | Metoda polaczenia | Co jest publikowane |
|-----------|-------------------|---------------------|
| LinkedIn | OAuth 2.0 (kliknij Polacz) | Posty tekstowe przez LinkedIn API |
| Twitter/X | Reczne dane API | Tweety przez Twitter API v2 |
| Facebook | OAuth 2.0 (wybierz strone) | Posty na stronie przez Graph API v19 |
| Telegram | Reczne (token bota + ID czatu) | Wiadomosci przez Telegram Bot API |

## Laczenie kont

### Ustawienia > Integracje

1. Przejdz do **Ustawienia > Integracje**
2. Zobaczysz karty dla kazdej platformy

### LinkedIn

1. Kliknij **Polacz** na karcie LinkedIn
2. Zostaniesz przekierowany do LinkedIn w celu autoryzacji
3. Przyznaj wymagane uprawnienia
4. Zostaniesz przekierowany z powrotem — konto pojawi sie jako polaczone

**Wymagane zmienne srodowiskowe:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

### Twitter/X

1. Kliknij **Polacz** na karcie Twitter
2. Wprowadz swoje dane uwierzytelniajace API:
   - **App Key** (API Key)
   - **App Secret** (API Secret)
   - **Access Token**
   - **Access Secret**
3. Kliknij **Zapisz**

Potrzebujesz konta Twitter Developer z dostepem do API, aby uzyskac te dane uwierzytelniajace.

### Facebook

1. Kliknij **Polacz** na karcie Facebook
2. Zostaniesz przekierowany do Facebooka w celu autoryzacji
3. Wybierz **Strone**, na ktorej chcesz publikowac
4. Przyznaj wymagane uprawnienia
5. Zostaniesz przekierowany z powrotem z polaczona strona

**Wymagane zmienne srodowiskowe:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

### Telegram

1. Kliknij **Polacz** na karcie Telegram
2. Wprowadz:
   - **Bot Token** — z BotFather
   - **Chat ID** — identyfikator kanalu lub grupy
3. Kliknij **Zapisz**

## Publikowanie tresci

### Ze strony tresci

1. Otworz sekcje **Tresci** w projekcie
2. Znajdz tresc o statusie **APPROVED** lub **PUBLISHED**
3. Kliknij przycisk **Publikuj**
4. W oknie modalnym wybierz, na ktore polaczone konta opublikowac
5. Kliknij **Publikuj**

### Status publikacji

Kazda proba publikacji jest sledzona:

| Status | Znaczenie |
|--------|----------|
| PENDING | Publikacja w toku |
| PUBLISHED | Pomyslnie opublikowano na platformie |
| FAILED | Wystapil blad (sprawdz komunikat bledu) |

### Przegladanie historii publikacji

1. Otworz element tresci
2. Przejrzyj historie publikacji pokazujaca:
   - Platforme i konto
   - Status (Oczekujacy / Opublikowany / Blad)
   - URL postu (jesli opublikowany)
   - Komunikat bledu (jesli wystapil blad)
   - Znacznik czasu

## Publikowanie z uwzglednieniem jezyka

### Domyslny jezyk konta spolecznosciowego

Kazde polaczone konto spolecznosciowe moze miec przypisany **domyslny jezyk**. Informuje to system, ktorej wersji jezykowej tresci uzyc przy publikowaniu na tym koncie.

Na przyklad:
- Twoje konto LinkedIn jest ustawione na **angielski**
- Twoja strona Facebook jest ustawiona na **polski**
- Twoj kanal Telegram jest ustawiony na **rosyjski**

### Publikowanie tresci wielojezycznych

Gdy publikujesz tresc z wieloma wersjami jezykowymi (EN/PL/RU), system automatycznie dopasowuje odpowiednia wersje jezykowa do kazdego konta na podstawie jego domyslnego ustawienia jezykowego:

1. Kliknij **Publikuj** na karcie tresci wielojezycznej
2. Wybierz konta do opublikowania
3. System automatycznie wybiera odpowiednia wersje jezykowa dla kazdego konta
4. Przejrzyj mapowanie i kliknij **Publikuj**

Jesli konto nie ma ustawionego domyslnego jezyka, zostaniesz poproszony o wybranie wersji jezykowej do wyslania na to konto.

### Ustawianie domyslnego jezyka

1. Przejdz do **Ustawienia > Integracje**
2. Kliknij **Edytuj** na polaczonym koncie
3. Wybierz **Domyslny jezyk** (angielski, polski lub rosyjski)
4. Zapisz zmiany

## Zarzadzanie kontami

### Odlaczanie

1. Przejdz do **Ustawienia > Integracje**
2. Kliknij **Odlacz** na koncie, ktore chcesz usunac
3. Potwierdz akcje

### Wygasanie tokenow

Tokeny OAuth (LinkedIn, Facebook) moga wygasnac. Jesli publikacja nie powiedzie sie z bledem autoryzacji, ponownie polacz konto, aby odswiezyc tokeny.

## Bezpieczenstwo

Wszystkie dane uwierzytelniajace kont spolecznosciowych i tokeny OAuth sa szyfrowane w bazie danych za pomoca szyfrowania AES-256-CBC — ten sam standard bezpieczenstwa, ktory jest stosowany dla danych uwierzytelniajacych kont e-mail.
