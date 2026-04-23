# Zaawansowane funkcje

## SEO i słowa kluczowe

Śledź pozycje w wyszukiwarkach i odkrywaj konkurentów dla swojego projektu. Moduł SEO umożliwia prowadzenie listy słów kluczowych, pobieranie oficjalnych danych o pozycjach z Google Search Console, ręczne wpisywanie pozycji oraz przeglądanie trendów rankingowych w czasie.

### Dodawanie słów kluczowych

1. Otwórz **SEO** w bocznym menu projektu.
2. Kliknij **Dodaj słowo kluczowe**.
3. Uzupełnij pola:
   - **Słowo kluczowe** — fraza, na którą chcesz się pozycjonować.
   - **Docelowy URL** — strona na Twoim serwisie, która powinna rankować na to słowo kluczowe. Domyślnie uzupełniany adresem URL witryny projektu.
   - **Ustawienia regionalne wyszukiwania** — który rynek Google sprawdzać (pl-PL, en-US, ru-RU).
   - **Intencja** — Informacyjna / Nawigacyjna / Komercyjna / Transakcyjna. Pomaga dopasować generowane przez AI treści do intencji użytkownika.
   - **Docelowa pozycja** (opcjonalnie) — Twój cel pozycyjny, wyświetlany jako przerywana linia referencyjna na wykresie historii.

### Łączenie z Google Search Console

Połączenie z Search Console umożliwia platformie automatyczne pobieranie oficjalnych danych rankingowych z Google. Search Console jest bezpłatne i dostarcza dokładne dane o kliknięciach, wyświetleniach i pozycjach.

**Przed rozpoczęciem:** Twoja witryna musi być już zweryfikowana w Google Search Console (przez rekord DNS, plik HTML lub Google Analytics).

1. Otwórz **Ustawienia projektu → Google Search Console**.
2. Kliknij **Połącz Google Search Console**. Nastąpi przekierowanie do ekranu zgody Google.
3. **Jeśli widzisz komunikat „Ta aplikacja nie jest zweryfikowana":** kliknij **Zaawansowane**, a następnie **Przejdź do [nazwa aplikacji] (niebezpieczne)**. Aplikacja jest używana produkcyjnie i jest bezpieczna — Google wyświetla to ostrzeżenie, ponieważ weryfikacja OAuth jest jeszcze w toku. Stan weryfikacji jest śledzony w zgłoszeniu [#70](https://github.com/your-org/marketing-ai-assistant/issues/70).
4. Udziel dostępu **tylko do odczytu Search Console** i zakończ proces. Nastąpi przekierowanie z powrotem do ustawień.
5. Z listy rozwijanej **Zweryfikowana właściwość Search Console** wybierz swoją witrynę. Lista zawiera wszystkie właściwości zweryfikowane na Twoim koncie Google. Aplikacja automatycznie wstępnie wybiera najlepsze dopasowanie do domeny projektu.
6. Kliknij **Zapisz**.

Po połączeniu na stronie **Analityka** projektu pojawi się blok **Wyniki w Google Search** (opis poniżej). Na stronie SEO dostępny staje się także przycisk **Synchronizuj z GSC**.

### Synchronizacja pozycji z GSC

Po połączeniu Search Console użyj funkcji synchronizacji, aby jednocześnie wypełnić historię pozycji dla wszystkich śledzonych słów kluczowych.

1. Na stronie **SEO** kliknij **Synchronizuj z Google Search Console**.
2. Platforma wysyła zapytanie do GSC o dane rankingowe z wczoraj, dopasowuje każde słowo kluczowe na podstawie tekstu zapytania i docelowego URL (dopasowanie hosta) i zapisuje wynik w historii słowa kluczowego.
3. Po zakończeniu synchronizacji pojawia się **karta wyników** pokazująca każde słowo kluczowe z informacją o:
   - poprzedniej pozycji → nowej pozycji,
   - strzałkach w górę/dół wskazujących zmianę,
   - etykiecie „Brak dopasowania" dla słów kluczowych nieznalezionych w danych GSC.

Karta wyników pozostaje widoczna po przeładowaniu strony, dopóki jej nie zamkniesz.

**Rozumienie „0 z N dopasowań":**

Jeśli żadne słowo kluczowe nie zostało dopasowane, może zachodzić jedna lub więcej z poniższych sytuacji:

| Przyczyna | Co zrobić |
|-----------|-----------|
| Witryna nie jest zindeksowana lub ma słabą widoczność | Sprawdź `site:twojadomena.pl` w Google. Jeśli pojawi się mało stron, prześlij mapę witryny w GSC. |
| Słowa kluczowe nie mają kliknięć/wyświetleń w GSC | Otwórz GSC → Skuteczność → Wyniki wyszukiwania. Jeśli Twoje słowa kluczowe się nie pojawiają, Twoja witryna jeszcze nie rankuje w top ~100 dla nich. |
| Nowa witryna | Nowe witryny zazwyczaj pojawiają się w wynikach Google po 2–6 tygodniach. Do tego czasu korzystaj z ręcznego wprowadzania pozycji (poniżej). |
| Opóźnienie danych GSC | GSC raportuje dane z opóźnieniem 2–3 dni. Dzisiejsze wyszukiwania pojawią się za 2–3 dni. |
| Niezgodność docelowego URL | Strona faktycznie rankująca w Google może się różnić od zapisanego Docelowego URL. Sprawdź w GSC → Skuteczność, które URL-e Google wyświetla. |

**Codzienna automatyczna synchronizacja:** zadanie cron uruchamiane jest codziennie o 03:00 UTC i automatycznie aktualizuje historię pozycji. Przycisk należy klikać ręcznie tylko w celu uzyskania natychmiastowej aktualizacji.

**Częstotliwość zależna od planu:** plan FREE synchronizuje w poniedziałki (top 5 słów kluczowych); plan PRO — codziennie (top 30); plan ENTERPRISE — codziennie (top 90).

### Zapisywanie pozycji ręcznie

Korzystaj z ręcznego wprowadzania, gdy GSC nie jest połączony, gdy słowo kluczowe jest zbyt nowe, by pojawić się w danych GSC, lub gdy chcesz zapisać dzisiejszą pozycję przed dostępnością danych GSC.

1. Na liście słów kluczowych kliknij **Zapisz pozycję** przy wybranym słowie kluczowym.
2. W oknie dialogowym wprowadź:
   - **Aktualna pozycja** — miejsce (1–100), na którym Twój docelowy URL wyświetla się w Google dla tego słowa kluczowego. Zaznacz pole **„Poza top 100"**, jeśli Twoja strona nie pojawia się w pierwszych 100 wynikach.
   - **Dopasowany URL** — URL, który Google pokazał dla tego słowa kluczowego. Domyślnie Twój docelowy URL. Zmień go tylko wtedy, gdy Google pozycjonuje inną podstronę Twojego serwisu.
3. Kliknij **Zapisz pozycję**.

Sprawdzenie trafia do historii słowa kluczowego z dzisiejszą datą.

### Przeglądanie historii pozycji

Kliknij **Pokaż historię** przy dowolnym słowie kluczowym, aby otworzyć jego stronę szczegółową. Zobaczysz:

- Wykres liniowy pozycji w czasie — pozycja 1 na górze; mniejsza liczba oznacza wyższą pozycję w wynikach wyszukiwania.
- Przerywaną poziomą linię na poziomie Twojej docelowej pozycji (jeśli ustawiona).
- Zakładki z zakresem dat: **7 dni / 30 dni / 90 dni / niestandardowy**.
- Tabelę ostatnich sprawdzeń z datą, pozycją i URL-em dopasowanym przez Google.

### Blok Wyniki w Google Search na stronie Analityka

Po podłączeniu Google Search Console na stronie **Analityka** projektu pojawia się blok **Wyniki w Google Search** zawierający:

| Karta | Opis |
|-------|------|
| Łączne kliknięcia | Suma kliknięć w wybranym okresie |
| Łączne wyświetlenia | Suma wyświetleń |
| Średni CTR | Średni współczynnik klikalności |
| Średnia pozycja | Średnia pozycja w rankingu (niższa = lepsza; oś Y wykresu jest odwrócona) |

Każda karta zawiera wykres przebiegu pokazujący metrykę w czasie.

Poniżej kart KPI:

- **Top 20 zapytań** — sortowalna tabela (zapytanie, kliknięcia, wyświetlenia, CTR, pozycja)
- **Top 20 stron** — te same kolumny, prezentujące Twoje URL-e
- **Podział według urządzeń** — wykres pierścieniowy (desktop / mobile / tablet)
- **Top 10 krajów** — tabela ruchu według kraju

**Selektor okresu:** 7 dni / 28 dni / 90 dni. Dane są pobierane na żywo z Search Console i cache'owane przez maksymalnie godzinę.

Jeśli GSC nie jest podłączony, zamiast bloku wyświetlany jest baner z linkiem do ustawień.

### Konkurenci

#### Ręczne dodawanie konkurentów

Na stronie **SEO** przejdź do zakładki **Konkurenci**. Kliknij **Dodaj konkurenta**, podaj nazwę i adres URL strony, a następnie zapisz.

#### Sugestie konkurentów od AI

Kliknij **Zaproponuj konkurentów z AI**. Platforma wysyła kontekst projektu i śledzone słowa kluczowe do agenta AI, który proponuje do 5 realnych konkurentów z krótkim uzasadnieniem wyjaśniającym ich trafność. Przejrzyj karty propozycji:

- **Zatwierdź** — dodaje konkurenta do Twojej aktywnej listy.
- **Odrzuć** — odrzuca propozycję (odrzucone wpisy nie będą ponownie proponowane).

### Co zrobić, gdy „0 z N słów kluczowych dopasowanych"

Przejdź przez tę listę kontrolną:

1. **Sprawdź indeksację.** Uruchom `site:twojadomena.pl` w Google. Jeśli pojawia się bardzo mało stron, Twoja witryna nie jest dobrze zindeksowana. Prześlij mapę witryny przez GSC → Mapy witryn.
2. **Sprawdź GSC Skuteczność bezpośrednio.** Otwórz Google Search Console → Skuteczność → Wyniki wyszukiwania. Wyszukaj swoje słowo kluczowe w filtrze. Jeśli widoczne są wyświetlenia, synchronizacja powinna je wkrótce pobrać. Jeśli nie ma żadnych wyników, jeszcze nie rankujesz na to słowo kluczowe.
3. **Poczekaj przy nowych witrynach.** Zupełnie nowe witryny zazwyczaj zaczynają pojawiać się w wynikach Google po 2–6 tygodniach od uruchomienia.
4. **Uwzględnij opóźnienie GSC.** Dane GSC są 2–3 dni do tyłu. Synchronizacja wykonana dziś odzwierciedla pozycje sprzed 2–3 dni.
5. **Zweryfikuj docelowe URL-e.** Otwórz każde słowo kluczowe w aplikacji i sprawdź, czy Docelowy URL zgadza się z tym, co GSC raportuje jako rankujący URL. Popraw rozbieżności, edytując słowo kluczowe.
6. **Twórz więcej treści.** Użyj Content Studio do tworzenia stron i artykułów blogowych nakierowanych na Twoje słowa kluczowe. Więcej tematycznej treści poprawia widoczność.
7. **Napraw techniczne SEO.** Sprawdź tagi `noindex`, błędy indeksowania w GSC → Pokrycie oraz brakujące tagi kanoniczne.

---

## Testy A/B

Przeprowadzanie eksperymentów w celu optymalizacji treści marketingowych.

### Tworzenie testu

1. Przejdź do sekcji **Eksperymenty** w projekcie
2. Kliknij **Nowy test**
3. Skonfiguruj:
   - **Nazwa** — nazwa testu
   - **Typ** — Temat e-maila, Wariant treści lub Landing page
4. Kliknij **Utwórz**

### Dodawanie wariantów

1. Otwórz test
2. Kliknij **Dodaj wariant**
3. Nadaj nazwę wariantowi (np. „A", „B") i skonfiguruj jego treść
4. Każdy wariant śledzi wyświetlenia i konwersje

### Uruchamianie testu

1. Kliknij **Rozpocznij**, aby uruchomić test
2. W miarę interakcji użytkowników rejestrowane są wyświetlenia i konwersje dla każdego wariantu
3. Kliknij **Zakończ** i wybierz zwycięzcę

## Monitoring konkurencji

Śledzenie obecności online konkurentów.

### Dodawanie konkurentów

1. Przejdź do sekcji **Konkurenci** w projekcie
2. Kliknij **Dodaj konkurenta**
3. Wprowadź nazwę, URL strony i opis
4. Kliknij **Zapisz**

### Tworzenie snapshotów

1. Otwórz konkurenta
2. Kliknij **Zrób snapshot**
3. System przechwytuje aktualny stan ich strony
4. Zmiany w stosunku do poprzedniego snapshotu są podświetlone

## Webhooki

Otrzymywanie powiadomień o zdarzeniach w organizacji.

### Konfiguracja webhooków

1. Przejdź do **Ustawienia > Webhooki**
2. Kliknij **Dodaj webhook**
3. Skonfiguruj:
   - **URL** — endpoint do otrzymywania powiadomień
   - **Zdarzenia** — które zdarzenia subskrybować (np. `content.published`, `campaign.sent`, `conversion.tracked`)
   - **Sekret** — sekret podpisywania do weryfikacji danych
4. Kliknij **Zapisz**

### Bezpieczeństwo danych

Wszystkie dane webhooków są podpisywane HMAC-SHA256 za pomocą Twojego sekretu. Podpis jest wysyłany w nagłówku `X-Signature-256`. Weryfikuj ten podpis w swoim endpoincie odbiorczym, aby zapewnić autentyczność.

### Testowanie

Kliknij **Testuj** na dowolnym webhooku, aby wysłać przykładowe dane na Twój URL.

## Śledzenie strony internetowej

Osadzenie snippetu śledzącego na stronie w celu zbierania danych analitycznych.

### Uzyskanie snippetu

1. Przejdź do sekcji **Analityka** w projekcie
2. Znajdź kod **Snippet śledzący**
3. Skopiuj snippet JavaScript
4. Wklej go do HTML swojej strony (przed `</body>`)

### Co jest śledzone

| Zdarzenie | Opis |
|-----------|------|
| Wyświetlenie strony | Każda wizyta z URL i referrerem |
| Identyfikacja | Identyfikacja użytkownika (e-mail, imię, plan) |
| Krok lejka | Niestandardowe zdarzenia postępów w lejku |
| Konwersja | Zdarzenia konwersji (rejestracja, aktualizacja planu itp.) |

### Piksel śledzący

Do śledzenia e-maili użyj URL piksela śledzącego (`/t/pixel.gif`), aby śledzić otwarcia e-maili bez JavaScript.

## Kalendarz treści

Przeglądanie harmonogramu treści w wizualnym formacie kalendarza.

1. Przejdź do sekcji **Kalendarz** w projekcie
2. Zobacz elementy treści rozmieszczone według zaplanowanych lub opublikowanych dat
3. Zakresy dat kampanii są również wyświetlane
4. Kliknij dowolny element, aby go przeglądać lub edytować

## Eksport projektu

Eksport danych projektu w celu tworzenia kopii zapasowych lub migracji.

### Eksportowanie

1. Przejdź do **Ustawień** projektu
2. Kliknij **Eksportuj projekt**
3. Wybierz, które sekcje uwzględnić (treści, kampanie, dokumenty, listy kontrolne itp.)
4. Pobierz wyeksportowane dane

## Powiadomienia o błędach zadań w tle

Platforma uruchamia kilka zaplanowanych zadań w tle:

| Zadanie | Co robi |
|---|---|
| Publikacja w social media | Publikuje zakolejkowane treści na połączonych kontach |
| Zaplanowany agent AI | Uruchamia agentów AI według harmonogramu cron |
| Dzienne agregowanie analityki | Podsumowuje dzienne metryki dla każdego projektu |
| Sekwencje emailowe | Przenosi subskrybentów przez sekwencje emailowe |
| Synchronizacja Google Play | Odświeża recenzje, oceny i instalacje dla projektów mobilnych |

Gdy któryś z tych zadań zakończy się niepowodzeniem dla określonego zasobu (konto social, projekt, sekwencja itp.), platforma automatycznie powiadamia każdego **OWNER** i **ADMIN** organizacji emailem. Email jest wysyłany w preferowanym języku każdego odbiorcy i zawiera:

- Jakie zadanie w tle nie powiodło się
- Który zasób był dotknięty (np. "Facebook: MiCode Page")
- Komunikat błędu
- Bezpośredni link do odpowiedniej strony ustawień

### Ochrona przed spamem

Jeśli ten sam błąd powtarza się (np. nieprawidłowy token Facebooka powoduje, że publikacja zawodzi co minutę), system wysyła **maksymalnie jeden email na 24 godziny** na unikalną sygnaturę błędu w organizacji. Licznik wystąpień w emailu mówi, ile razy błąd był widziany od pierwszego wykrycia. Po naprawieniu przyczyny i pomyślnym wykonaniu zadania licznik resetuje się.

### Zmiana języka powiadomień

Zmień preferowany język w menu w prawym górnym rogu. Ustawienie jest zapisywane w Twoim profilu, więc wszystkie przyszłe powiadomienia otrzymasz w tym języku.
