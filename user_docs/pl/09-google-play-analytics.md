# Analityka Google Play

## Przegląd

Połącz swoje Google Play Console, aby śledzić wydajność aplikacji mobilnej bezpośrednio w Marketing AI Assistant. Przeglądaj statystyki instalacji, raporty awarii, recenzje użytkowników i zarządzaj odpowiedziami z pomocą AI.

Ta funkcja jest dostępna dla projektów typu **Aplikacja mobilna**.

## Łączenie z Google Play Console

### Opcja 1: Połącz przez Google (OAuth)

1. Otwórz projekt aplikacji mobilnej
2. Przejdź do **Ustawienia**
3. W sekcji **Google Play Console** kliknij **Połącz przez Google**
4. Zaloguj się na konto Google z dostępem do Play Console
5. Udziel wymaganych uprawnień
6. Po przekierowaniu wpisz nazwę pakietu aplikacji (np. `com.example.myapp`)

### Opcja 2: Konto usługi

1. Utwórz konto usługi w [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Przyznaj mu dostęp do aplikacji w Google Play Console (Ustawienia > Dostęp do API)
3. Pobierz plik klucza JSON
4. W ustawieniach projektu kliknij **Użyj konta usługi**
5. Prześlij klucz JSON i wpisz nazwę pakietu
6. Kliknij **Połącz**

## Konfiguracja danych o instalacjach

Liczba instalacji, oceny i dane o stronie aplikacji wymagają dodatkowego kroku — połączenia z eksportami Cloud Storage z Play Console.

1. Otwórz [Google Play Console](https://play.google.com/console)
2. Przejdź do **Pobierz raporty** (w menu po lewej)
3. Skopiuj **Cloud Storage URI** (zaczyna się od `gs://pubsite_prod_rev_...`)
4. W ustawieniach projektu wklej URI w pole **Cloud Storage URI**
5. Kliknij **Zapisz**
6. Kliknij **Synchronizuj teraz**, aby pobrać dane historyczne

## Panel analityki

Strona analityki dla projektów aplikacji mobilnych zawiera:

### Karta Przegląd
- **Karty KPI** — instalacje, średnia ocena, przychody, wskaźnik awarii (gdy Cloud Storage jest skonfigurowany)
- **Wykres stabilności** — wskaźnik awarii i ANR w czasie
- **Ostatnie recenzje**

### Karta Instalacje
Pokazuje dzienne trendy instalacji, odinstalowań i aktualizacji. Wymaga Cloud Storage URI.

### Karta Strona aplikacji
Odwiedzający stronę aplikacji i współczynnik konwersji (z odwiedzających na instalacje). Wymaga Cloud Storage URI.

### Karta Stabilność
- Wskaźnik awarii i ANR (Application Not Responding)
- Wykres dziennych trendów

### Karta Przychody
Metryki przychodów i subskrypcji. Wymaga Cloud Storage URI.

### Karta Recenzje
- Wszystkie recenzje użytkowników z ocenami gwiazdkowymi
- Filtrowanie po ocenie (1-5 gwiazdek) lub recenzjach bez odpowiedzi
- Sortowanie po dacie lub ocenie

## Odpowiedzi AI na recenzje

Generuj profesjonalne odpowiedzi na recenzje użytkowników za pomocą AI:

1. Przejdź do karty **Recenzje**
2. Znajdź recenzję, na którą chcesz odpowiedzieć
3. Kliknij **Odpowiedź AI**
4. AI wygeneruje kontekstową odpowiedź na podstawie:
   - Tekstu i oceny recenzji
   - Nazwy i opisu Twojej aplikacji
   - Języka recenzji (odpowiedź jest w tym samym języku co recenzja)
5. W razie potrzeby edytuj sugerowaną odpowiedź
6. Kliknij **Wyślij odpowiedź**, aby opublikować ją w Google Play

Odpowiedzi AI są wliczane do limitu generacji AI w Twoim planie.

## Automatyczna synchronizacja

Dane synchronizują się automatycznie:
- **Przy wejściu na stronę** — jeśli dane są starsze niż 10 minut, synchronizacja uruchamia się automatycznie
- **Podczas przeglądania** — dane odświeżają się co 5 minut, gdy jesteś na stronie analityki
- **Cron w tle** — synchronizacja co godzinę (co 6 godzin dla planu PRO)

Wskaźnik "Synchronizacja..." pojawia się podczas aktywnej synchronizacji.

## Limity planów

| Funkcja | FREE | PRO | ENTERPRISE |
|---------|------|-----|------------|
| Integracja Google Play | Nie | Tak | Tak |
| Odpowiedzi AI na recenzje | — | Z limitu AI (500/mies.) | Bez limitu |
| Częstotliwość synchronizacji | — | Co 6 godzin | Co 1 godzinę |
| Historia początkowa | — | 6 miesięcy | 12 miesięcy |

## Rozwiązywanie problemów

### "GOOGLE_CLIENT_ID not configured"
Dane uwierzytelniające Google OAuth nie są skonfigurowane w środowisku serwera. Skontaktuj się z administratorem.

### "Access blocked: app not verified"
Dodaj swoje konto Google jako użytkownika testowego w Google Cloud Console > OAuth consent screen > Test users.

### Brak danych o instalacjach
Upewnij się, że skonfigurowałeś Cloud Storage URI w ustawieniach projektu. Dane o instalacjach są dostępne tylko przez eksport CSV z Play Console, a nie bezpośrednio przez API.

### Błąd synchronizacji
Sprawdź, czy Twoje konto Google nadal ma dostęp do Play Console. Jeśli token został unieważniony, rozłącz i ponownie połącz integrację.
