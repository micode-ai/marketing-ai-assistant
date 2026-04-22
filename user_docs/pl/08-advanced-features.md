# Zaawansowane funkcje

## SEO i słowa kluczowe

Śledź pozycje w wyszukiwarkach i odkrywaj konkurentów dla swojego projektu.

### Dodawanie słów kluczowych

1. Otwórz **SEO** w bocznym menu projektu.
2. Kliknij **Dodaj słowo kluczowe**.
3. Uzupełnij pola:
   - **Słowo kluczowe** — fraza, na którą chcesz się pozycjonować.
   - **Docelowy URL** — strona na Twoim serwisie, która powinna rankować na to słowo kluczowe.
   - **Ustawienia regionalne wyszukiwania** — który rynek Google sprawdzać (pl-PL, en-US, ru-RU).
   - **Intencja** — Informacyjna / Nawigacyjna / Komercyjna / Transakcyjna. Pomaga dopasować generowane przez AI treści do intencji użytkownika.
   - **Docelowa pozycja** (opcjonalnie) — Twój cel pozycyjny, wyświetlany jako linia referencyjna na wykresie historii.

### Podłączenie Brave Search

Śledzenie pozycji korzysta z Brave Search API — plan bezpłatny, 2000 zapytań miesięcznie.

1. Zarejestruj się na https://api.search.brave.com/app/register
2. Potwierdź e-mail i utwórz klucz API w panelu (https://api.search.brave.com/app/dashboard). Wybierz plan bezpłatny „Data for AI".
3. Skopiuj klucz API.
4. Otwórz **Ustawienia projektu → Brave Search**, wklej klucz API, kliknij **Połącz**.

Po podłączeniu aplikacja będzie sprawdzać śledzone słowa kluczowe według harmonogramu:
- **Plan Free:** do 5 słów kluczowych, raz w tygodniu w poniedziałki.
- **Plan Pro:** do 30 słów kluczowych, codziennie.
- **Plan Enterprise:** do 90 słów kluczowych, codziennie. Może przekroczyć bezpłatny limit 2000 zapytań miesięcznie — w razie potrzeby należy wykupić wyższy plan Brave.

Możesz też kliknąć **Sprawdź teraz** przy dowolnym słowie kluczowym, aby uruchomić sprawdzenie natychmiast (limit: 3 ręczne sprawdzenia na godzinę na słowo kluczowe).

### Przeglądanie historii pozycji

Kliknij **Pokaż historię** przy dowolnym słowie kluczowym, aby otworzyć jego stronę szczegółową. Zobaczysz:
- Wykres liniowy pozycji w czasie (pozycja 1 na górze — niższa liczba = wyższa pozycja)
- Linię przerywaną oznaczającą Twoją docelową pozycję
- Zakładki z zakresem dat: 7 dni / 30 dni / 90 dni / niestandardowy
- Tabelę ostatnich sprawdzeń z URL-em dopasowanym przez Google

### Konkurenci

#### Ręczne dodawanie konkurentów

Kliknij **Dodaj konkurenta**, podaj nazwę i adres URL strony.

#### Sugestie konkurentów przez AI

Kliknij **Zaproponuj konkurentów z AI**. Aplikacja wysyła kontekst projektu i śledzone słowa kluczowe do agenta AI, który proponuje do 5 realnych konkurentów z krótkim uzasadnieniem. Przejrzyj karty i kliknij **Zatwierdź**, aby dodać konkurenta do listy, lub **Odrzuć**, aby go odrzucić (odrzucone sugestie nie będą ponownie proponowane).

## Testy A/B

Przeprowadzanie eksperymentow w celu optymalizacji tresci marketingowych.

### Tworzenie testu

1. Przejdz do sekcji **Eksperymenty** w projekcie
2. Kliknij **Nowy test**
3. Skonfiguruj:
   - **Nazwa** — nazwa testu
   - **Typ** — Temat e-maila, Wariant tresci lub Landing page
4. Kliknij **Utworz**

### Dodawanie wariantow

1. Otworz test
2. Kliknij **Dodaj wariant**
3. Nadaj nazwe wariantowi (np. „A", „B") i skonfiguruj jego tresc
4. Kazdy wariant sledzi wyswietlenia i konwersje

### Uruchamianie testu

1. Kliknij **Rozpocznij**, aby uruchomic test
2. W miare interakcji uzytkownikow rejestrowane sa wyswietlenia i konwersje dla kazdego wariantu
3. Kliknij **Zakoncz** i wybierz zwyciezce

## Monitoring konkurencji

Sledzenie obecnosci online konkurentow.

### Dodawanie konkurentow

1. Przejdz do sekcji **Konkurenci** w projekcie
2. Kliknij **Dodaj konkurenta**
3. Wprowadz nazwe, URL strony i opis
4. Kliknij **Zapisz**

### Tworzenie snapshotow

1. Otworz konkurenta
2. Kliknij **Zrob snapshot**
3. System przechwytuje aktualny stan ich strony
4. Zmiany w stosunku do poprzedniego snapshotu sa podswietlone

## Webhooki

Otrzymywanie powiadomien o zdarzeniach w organizacji.

### Konfiguracja webhookow

1. Przejdz do **Ustawienia > Webhooki**
2. Kliknij **Dodaj webhook**
3. Skonfiguruj:
   - **URL** — endpoint do otrzymywania powiadomien
   - **Zdarzenia** — ktore zdarzenia subskrybowac (np. `content.published`, `campaign.sent`, `conversion.tracked`)
   - **Sekret** — sekret podpisywania do weryfikacji danych
4. Kliknij **Zapisz**

### Bezpieczenstwo danych

Wszystkie dane webhookow sa podpisywane HMAC-SHA256 za pomoca Twojego sekretu. Podpis jest wysylany w naglowku `X-Signature-256`. Weryfikuj ten podpis w swoim endpoincie odbiorczym, aby zapewnic autentycznosc.

### Testowanie

Kliknij **Testuj** na dowolnym webhooku, aby wyslac przykladowe dane na Twoj URL.

## Sledzenie strony internetowej

Osadzenie snippetu sledzacego na stronie w celu zbierania danych analitycznych.

### Uzyskanie snippetu

1. Przejdz do sekcji **Analityka** w projekcie
2. Znajdz kod **Snippet sledzacy**
3. Skopiuj snippet JavaScript
4. Wklej go do HTML swojej strony (przed `</body>`)

### Co jest sledzone

| Zdarzenie | Opis |
|-----------|------|
| Wyswietlenie strony | Kazda wizyta z URL i referrerem |
| Identyfikacja | Identyfikacja uzytkownika (e-mail, imie, plan) |
| Krok lejka | Niestandardowe zdarzenia postepow w lejku |
| Konwersja | Zdarzenia konwersji (rejestracja, aktualizacja planu itp.) |

### Piksel sledzacy

Do sledzenia e-maili uzyj URL piksela sledzacego (`/t/pixel.gif`), aby sledzic otwarcia e-maili bez JavaScript.

## Integracje Google

Polaczenie Google Search Console i Google Analytics 4 dla rozszerzonych danych.

### Laczenie

1. Przejdz do **Ustawienia > Integracje**
2. Kliknij **Polacz Google**
3. Autoryzuj dostep do Search Console i/lub GA4
4. Dane synchronizuja sie automatycznie

### Dostepne dane

| Zrodlo | Dane |
|--------|------|
| Search Console | Najczestsze zapytania, strony, pozycje, CTR, wyswietlenia |
| Google Analytics 4 | Sesje, uzytkownicy, wskaznik odrzucen, konwersje |

### Reczna synchronizacja

Kliknij **Synchronizuj**, aby recznie uruchomic odswiezanie danych z uslug Google.

## Kalendarz tresci

Przegladanie harmonogramu tresci w wizualnym formacie kalendarza.

1. Przejdz do sekcji **Kalendarz** w projekcie
2. Zobacz elementy tresci rozmieszczone wedlug zaplanowanych lub opublikowanych dat
3. Zakresy dat kampanii sa rowniez wyswietlane
4. Kliknij dowolny element, aby go przegladac lub edytowac

## Eksport projektu

Eksport danych projektu w celu tworzenia kopii zapasowych lub migracji.

### Eksportowanie

1. Przejdz do **Ustawien** projektu
2. Kliknij **Eksportuj projekt**
3. Wybierz, ktore sekcje uwzglednic (tresci, kampanie, dokumenty, listy kontrolne itp.)
4. Pobierz wyeksportowane dane

## Powiadomienia o bledach zadan w tle

Platforma uruchamia kilka zaplanowanych zadan w tle:

| Zadanie | Co robi |
|---|---|
| Publikacja w social media | Publikuje zakolejkowane tresci na polaczonych kontach |
| Zaplanowany agent AI | Uruchamia agentow AI wedlug harmonogramu cron |
| Dzienne agregowanie analityki | Podsumowuje dzienne metryki dla kazdego projektu |
| Sekwencje emailowe | Przenosi subskrybentow przez sekwencje emailowe |
| Synchronizacja Google Play | Odswieza recenzje, oceny i instalacje dla projektow mobilnych |

Gdy ktoryss z tych zadan zakonczy sie niepowodzeniem dla okreslonego zasobu (konto social, projekt, sekwencja itp.), platforma automatycznie powiadamia kazdego **OWNER** i **ADMIN** organizacji emailem. Email jest wysylany w preferowanym jezyku kazdego odbiorcy i zawiera:

- Jakie zadanie w tle nie powiodlo sie
- Ktory zasob byl dotkniety (np. "Facebook: MiCode Page")
- Komunikat bledu
- Bezposredni link do odpowiedniej strony ustawien

### Ochrona przed spamem

Jesli ten sam blad powtarza sie (np. nieprawidlowy token Facebooka powoduje, ze publikacja zawodzi co minute), system wysyla **maksymalnie jeden email na 24 godziny** na unikalna sygnature bledu w organizacji. Licznik wystapien w emailu mowi, ile razy blad byl widziany od pierwszego wykrycia. Po naprawieniu przyczyny i pomyslnym wykonaniu zadania licznik resetuje sie.

### Zmiana jezyka powiadomien

Zmien preferowany jezyk w menu w prawym gornym rogu. Ustawienie jest zapisywane w twoim profilu, wiec wszystkie przyszle powiadomienia otrzymasz w tym jezyku.
