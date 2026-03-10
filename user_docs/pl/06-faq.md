# Czesto zadawane pytania (FAQ)

## Ogolne

### Czym jest Marketing AI Assistant?

Marketing AI Assistant to platforma automatyzacji marketingu oparta na sztucznej inteligencji, ktora pomaga tworzyc tresci, zarzadzac kampaniami, wysylac e-maile, generowac dokumenty marketingowe i sledzic analityke. Wykorzystuje model OpenAI GPT-4o do generowania materialow marketingowych dostosowanych do Twojej marki.

### Jakie jezyki obsluguje aplikacja?

Interfejs jest dostepny w:
- Angielskim (English)
- Polskim
- Rosyjskim (Russkij)

Asystent czatu AI rowniez obsluguje rozmowy we wszystkich trzech jezykach.

### Czy potrzebuje karty platniczej do rejestracji?

Nie. Mozesz utworzyc darmowe konto i korzystac z planu FREE bez karty. Karta jest potrzebna tylko w przypadku aktualizacji do PRO lub ENTERPRISE.

---

## Konto i logowanie

### Nie moge sie zalogowac. Co robic?

- Upewnij sie, ze uzywasz prawidlowego e-maila i hasla
- Sprawdz, czy Caps Lock nie jest wlaczony
- Jesli zarejestrowales sie przez Google, uzyj przycisku **Zaloguj sie przez Google**
- Sprobuj odswiezyc strone i zalogowac sie ponownie

### Zapomnialem hasla. Jak je odzyskac?

Skontaktuj sie z administratorem organizacji w celu zresetowania hasla lub uzyj opcji odzyskiwania hasla na stronie logowania.

### Czy moge zmienic adres e-mail?

Skontaktuj sie z administratorem organizacji w sprawie zmiany e-maila.

### Jak usunac konto?

Skontaktuj sie z Wlascicielem organizacji, aby zostac usunietym.

---

## Projekty

### Ile projektow moge utworzyc?

| Plan | Limit projektow |
|------|----------------|
| FREE | 1 |
| PRO | 5 |
| ENTERPRISE | Bez limitu |

### Czy moge zarchiwizowac projekt?

Tak. Przejdz do ustawien projektu i kliknij **Archiwizuj projekt**. Zarchiwizowane projekty sa ukryte z glownej listy, ale nie usuniete.

### Czy moge przeniesc projekt do innej organizacji?

Przenoszenie projektow miedzy organizacjami nie jest obecnie obslugiwane. Nalezy ponownie utworzyc projekt w innej organizacji.

---

## Tresci AI

### Jak dziala generowanie tresci AI?

AI wykorzystuje kontekst projektu (grupa docelowa, glos marki, branza, cele) wraz z Twoim zapytaniem (temat, ton, platforma) do generowania tresci marketingowych za pomoca modelu OpenAI GPT-4o.

### Czy tresci generowane przez AI sa unikalne?

Tak, kazda generacja tworzy unikalna tresc. Mimo to zawsze zaleca sie przegladanie i edytowanie tresci AI przed publikacja.

### Czy moge edytowac tresci AI?

Oczywiscie. Tresci AI sa zapisywane jako szkic, ktory mozesz swobodnie edytowac i personalizowac. AI zapewnia swietny punkt wyjscia.

### Co jesli wynik AI mi sie nie podoba?

Mozesz:
- Wygenerowac ponownie z innymi parametrami
- Zmienic ton (profesjonalny, nieformalny, humorystyczny, formalny)
- Wybrac inny typ tresci lub platforme
- Podac bardziej szczegolowy temat i slowa kluczowe
- Edytowac wynik recznie

### Ile generacji AI mam dostepnych?

| Plan | Miesieczny limit |
|------|-----------------|
| FREE | 50 |
| PRO | 500 |
| ENTERPRISE | Bez limitu |

---

## E-mail marketing

### Jak zaczac wysylac e-maile?

1. Dodaj konto e-mail w **Ustawienia > Konta e-mail**
2. Utworz liste mailingowa w sekcji E-mail projektu
3. Dodaj subskrybentow
4. Skomponuj i wyslij kampanie

### Dlaczego powinienem dolaczac link wypisania?

Jest to wymagane przez przepisy e-mail marketingu (CAN-SPAM, RODO). Uzyj symbolu zastepczego `{{unsubscribe_url}}` w HTML, a system automatycznie wygeneruje unikalny link wypisania dla kazdego subskrybenta.

### Co sie dzieje, gdy ktos sie wypisze?

Status zmienia sie na „Wypisany" i nie bedzie juz otrzymywal e-maili z tej listy. Wypisanie jest rejestrowane ze znacznikiem czasu.

### Czy moge importowac subskrybentow?

Obecnie subskrybenci sa dodawani pojedynczo przez API lub interfejs webowy. Funkcja masowego importu moze zostac dodana w przyszlych aktualizacjach.

### Jacy dostawcy e-mail sa obslugiwani?

- **SMTP** — dowolny serwer SMTP (Gmail, Outlook, wlasny)
- **Resend** — nowoczesna usluga API e-mail

---

## Platnosci

### Jak zaktualizowac plan?

Przejdz do **Ustawienia > Platnosci** i kliknij **Aktualizuj** obok zadanego planu. Zostaniesz przekierowany na bezpieczna strone platnosci Stripe.

### Czy moge obnizyc plan?

Tak, przejdz do **Ustawienia > Platnosci > Zarzadzaj subskrypcja** i zmien plan w portalu Stripe.

### Kiedy odnawia sie okres rozliczeniowy?

Okres rozliczeniowy odnawia sie co miesiac od daty pierwszej subskrypcji.

### Jakie metody platnosci sa akceptowane?

Stripe akceptuje glowne karty kredytowe (Visa, Mastercard, American Express) oraz inne metody platnosci w zaleznosci od regionu.

### Jak anulowac subskrypcje?

Przejdz do **Ustawienia > Platnosci > Zarzadzaj subskrypcja** i kliknij **Anuluj plan** w portalu Stripe. Dostep jest utrzymywany do konca biezacego okresu rozliczeniowego.

---

## Publikacja w mediach spolecznosciowych

### Jak opublikowac tresc w mediach spolecznosciowych?

1. Podlacz konta spolecznosciowe w **Ustawienia > Integracje**
2. Otworz element tresci o statusie APPROVED lub PUBLISHED
3. Kliknij **Publikuj** i wybierz, na ktore konta opublikowac
4. System publikuje na kazdej wybranej platformie

### Jakie platformy spolecznosciowe sa obslugiwane?

- **LinkedIn** — polaczenie przez OAuth (kliknij Polacz, autoryzuj)
- **Twitter/X** — reczne dane uwierzytelniajace (klucze API i tokeny)
- **Facebook** — polaczenie przez OAuth (wybierz strone do publikacji)
- **Telegram** — reczne wprowadzenie (token bota i ID czatu)

### Dlaczego moj post w mediach spolecznosciowych nie zostal opublikowany?

Sprawdz historie publikacji, aby zobaczyc szczegoly bledu. Czeste przyczyny:
- Wygasle tokeny OAuth (ponownie polacz konto)
- Tresc przekracza limit znakow platformy
- Osiagnieto limit zapytan API

---

## Zaawansowane funkcje

### Jak dziala sledzenie slow kluczowych SEO?

Dodaj slowa kluczowe w sekcji **SEO** projektu. Dla kazdego slowa kluczowego mozesz:
- Ustawic intencje wyszukiwania (Informacyjna, Nawigacyjna, Komercyjna, Transakcyjna)
- Przypisac docelowy URL
- Rejestrowac pozycje w rankingu w czasie, aby sledzic postepy

### Czym sa testy A/B?

Testy A/B pozwalaja porownywac warianty tematow e-maili, tresci lub stron docelowych. Utworz test, dodaj warianty (A, B itd.), uruchom test i sledz wyswietlenia oraz konwersje, aby znalezc zwyciezce.

### Jak dzialaja webhooki?

Webhooki wysylaja powiadomienia na Twoje adresy URL, gdy zachodza zdarzenia (np. opublikowanie tresci, wyslanie kampanii). Dane sa podpisywane HMAC-SHA256. Skonfiguruj je w **Ustawienia > Webhooki**.

### Czy moge sledzic odwiedzajacych strone?

Tak. Kazdy projekt ma **snippet sledzacy** (JavaScript), ktory mozesz osadzic na swojej stronie. Sledzi on wyswietlenia stron, identyfikuje uzytkownikow i dostarcza dane do analityki projektu. Dostepny jest tez piksel sledzacy dla e-maili.

---

## Kwestie techniczne

### Jakie przegladarki sa obslugiwane?

Aplikacja dziala we wszystkich nowoczesnych przegladarkach:
- Chrome (zalecana)
- Firefox
- Safari
- Edge

### Czy moje dane sa bezpieczne?

- Wszystkie hasla sa szyfrowane bcrypt
- Dane logowania kont e-mail sa szyfrowane AES-256
- Komunikacja wykorzystuje tokeny JWT z krotkim terminem waznosci
- Aplikacja uzywa naglowkow bezpieczenstwa Helmet
- CORS jest skonfigurowany, aby zapobiec nieautoryzowanemu dostepowi

### Czy moge bezposrednio korzystac z API?

Dostep do API jest dostepny w planie **ENTERPRISE**. Dokumentacja API jest dostepna pod adresem `/api/docs` (Swagger UI).
