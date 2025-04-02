// =====================================================================
// 1. DOMAIN MODELS
// =====================================================================

class Player {
    constructor(name, rating) {
        this.name = name;
        this.rating = rating;
    }

    toString() {
        return `${this.name} (${this.rating})`;
    }
}

class Team {
    constructor(players = []) {
        this.players = players;
    }

    addPlayer(player) {
        this.players.push(player);
    }

    sortByRating() {
        this.players.sort((a, b) => b.rating - a.rating);
    }

    getTopPlayers(count = 3) {
        return this.players.slice(0, count);
    }
}

// =====================================================================
// 2. CONSTANTS AND CONFIGURATION
// =====================================================================

const APP_CONFIG = {
    MATCH: {
        MATCHES: ['A-Y', 'B-X', 'C-Z', 'A-X', 'BC-YZ'],
        POSITIONS: {
            HOME: ['A', 'B', 'C'],
            AWAY: ['X', 'Y', 'Z']
        },
        POSITIONS_DISPLAY: {
            HOME: ['1', '2', '3'],
            AWAY: ['1', '2', '3']
        },
        DEFAULT_RATINGS: {
            HOME: [1500, 1400, 1300],
            AWAY: [1550, 1450, 1350]
        }
    },
    UI: {
        STYLES: {
            BEST_MATCHUP: {
                border: '2px solid #2e7d32',
                color: '#2e7d32',
                fontWeight: 'bold'
            },
            WORST_MATCHUP: {
                border: '2px solid #c62828',
                color: '#c62828',
                fontWeight: 'bold'
            }
        }
    },
    CALCULATION: {
        ELO_FACTOR: 200 // The divisor in the ELO calculation
    }
};

// =====================================================================
// 3. SERVICES
// =====================================================================

class PermutationService {
    // Generate all permutations of [0, 1, 2]
    getPermutations() {
        const permutations = [];
        const arr = [0, 1, 2];

        // Sort the initial array to ensure consistent starting point
        arr.sort((a, b) => a - b);

        do {
            permutations.push([...arr]);
        } while (this.nextPermutation(arr));

        return permutations;
    }

    // Helper method for generating next permutation
    nextPermutation(arr) {
        // Find the largest index k such that arr[k] < arr[k + 1]
        let k = arr.length - 2;
        while (k >= 0 && arr[k] >= arr[k + 1]) {
            k--;
        }

        // If no such index exists, we've reached the last permutation
        if (k < 0) {
            return false;
        }

        // Find the largest index l > k such that arr[k] < arr[l]
        let l = arr.length - 1;
        while (l > k && arr[l] <= arr[k]) {
            l--;
        }

        // Swap the value of arr[k] with that of arr[l]
        [arr[k], arr[l]] = [arr[l], arr[k]];

        // Reverse the sequence from arr[k + 1] to the end
        let left = k + 1;
        let right = arr.length - 1;
        while (left < right) {
            [arr[left], arr[right]] = [arr[right], arr[left]];
            left++;
            right--;
        }

        return true;
    }

    // Generate all combinations of k elements from a set of n elements
    generateCombinations(n, k) {
        const result = [];

        function backtrack(start, current) {
            if (current.length === k) {
                result.push([...current]);
                return;
            }

            for (let i = start; i < n; i++) {
                current.push(i);
                backtrack(i + 1, current);
                current.pop();
            }
        }

        backtrack(0, []);
        return result;
    }
}

class ProbabilityService {
    // Calculate winning probability based on ratings
    calculateProbability(rating1, rating2) {
        return 1 / (1 + Math.pow(10, (rating2 - rating1) / APP_CONFIG.CALCULATION.ELO_FACTOR));
    }

    // Calculate probability of winning exactly k matches out of n
    calculateExactMatchWins(matchProbabilities, k, permutationService) {
        const n = matchProbabilities.length;
        let totalProb = 0;

        // Generate all combinations of k indices from n matches
        const combinations = permutationService.generateCombinations(n, k);

        for (const combo of combinations) {
            let prob = 1.0;

            // For each match
            for (let i = 0; i < n; i++) {
                if (combo.includes(i)) {
                    // This match is a win
                    prob *= matchProbabilities[i];
                } else {
                    // This match is a loss
                    prob *= (1 - matchProbabilities[i]);
                }
            }

            totalProb += prob;
        }

        return totalProb;
    }

    // Calculate overall competition win probability (winning at least 3 out of 5 matches)
    calculateOverallWinProbability(matchProbabilities, permutationService) {
        const winCounts = [3, 4, 5]; // Need to win at least 3 matches
        return winCounts.reduce((sum, k) => {
            return sum + this.calculateExactMatchWins(matchProbabilities, k, permutationService);
        }, 0);
    }
}

// =====================================================================
// 4. STATE MANAGEMENT
// =====================================================================

class AppState {
    constructor() {
        this.homeTeam = new Team();
        this.awayTeam = new Team();
        this.results = null;

        // Strategy matrix - add average option
        this.strategies = {
            minimax: null,       // Maximize minimum win probability
            ordered: null,       // Maximize win probability against rank-ordered opponent
            average: null,       // Maximize average win probability across all permutations
        };

        // Default opponent permutations for each strategy
        this.opponentArrangements = {
            minimax: null,       // Will be set to worst-case opponent
            ordered: '1-2-3',    // Standard 1-2-3 arrangement
            average: null        // Will be set to the opponent closest to the average
        };

        // Current view state tracking
        this.currentView = {
            type: null,          // 'home-row' or 'away-column'
            arrangement: null,   // The selected arrangement
            element: null        // The selected DOM element
        };
    }

    initialize() {
        // Parse URL or set defaults
        const urlPlayers = this.parseUrlPlayers();

        // Initialize teams with players
        this.initializeTeam('home', urlPlayers.homePlayers);
        this.initializeTeam('away', urlPlayers.awayPlayers);
    }

    initializeTeam(teamType, urlPlayers) {
        const team = this.getTeamByType(teamType);
        const defaultRatings = APP_CONFIG.MATCH.DEFAULT_RATINGS[teamType.toUpperCase()];

        if (urlPlayers.length === 0) {
            // Use defaults
            for (let i = 0; i < 3; i++) {
                team.addPlayer(new Player(`Player ${i + 1}`, defaultRatings[i]));
            }
        } else {
            // Use URL players
            urlPlayers.forEach(player => {
                team.addPlayer(new Player(player.name, player.rating));
            });

            // Add more if needed
            while (team.players.length < 3) {
                const num = team.players.length + 1;
                const defaultRating = defaultRatings[num - 1] || (defaultRatings[0] - (num * 100));
                team.addPlayer(new Player(`Default ${num}`, defaultRating));
            }
        }

        // Sort players by rating
        team.sortByRating();
    }

    getTeamByType(teamType) {
        return teamType === 'home' ? this.homeTeam : this.awayTeam;
    }

    parseUrlPlayers() {
        const params = new URLSearchParams(window.location.search);
        const homePlayers = [];
        const awayPlayers = [];

        // Iterate through URL parameters
        for (const [key, value] of params) {
            if (key.startsWith('home')) {
                const playerName = key.substring(4); // Remove 'home' prefix
                const playerRating = parseInt(value);
                if (playerName && !isNaN(playerRating)) {
                    homePlayers.push({ name: playerName, rating: playerRating });
                }
            } else if (key.startsWith('away')) {
                const playerName = key.substring(4); // Remove 'away' prefix
                const playerRating = parseInt(value);
                if (playerName && !isNaN(playerRating)) {
                    awayPlayers.push({ name: playerName, rating: playerRating });
                }
            }
        }

        return { homePlayers, awayPlayers };
    }

    updateUrl() {
        const params = new URLSearchParams();

        // Add home players
        this.homeTeam.players.forEach(player => {
            params.append(`home${player.name}`, player.rating);
        });

        // Add away players
        this.awayTeam.players.forEach(player => {
            params.append(`away${player.name}`, player.rating);
        });

        // Update URL without reloading page
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({ path: newUrl }, '', newUrl);

        // Update share URL display
        document.getElementById('shareUrl').textContent = window.location.href;
    }

    addCustomPlayer(teamType, name, rating) {
        const team = this.getTeamByType(teamType);
        team.addPlayer(new Player(name, rating));
        team.sortByRating();
        this.updateUrl();
    }
}

// =====================================================================
// 5. MATCH CALCULATOR
// =====================================================================

class MatchCalculator {
    constructor(appState) {
        this.appState = appState;
        this.permutationService = new PermutationService();
        this.probabilityService = new ProbabilityService();
    }

    // Get the player indices based on UI selections
    getSelectedIndices(teamId) {
        const indices = [];
        const selectors = document.querySelectorAll(`#${teamId} .player-selector`);

        selectors.forEach((selector, position) => {
            indices[position] = parseInt(selector.value);
        });

        return indices;
    }

    // Main calculation function
    calculateMatchProbabilities() {
        // Get player indices based on selections
        const homeSelections = this.getSelectedIndices('homePlayerSelections');
        const awaySelections = this.getSelectedIndices('awayPlayerSelections');

        // Get player objects based on selections
        const selectedHomePlayers = homeSelections.map(index => this.appState.homeTeam.players[index]);
        const selectedAwayPlayers = awaySelections.map(index => this.appState.awayTeam.players[index]);

        // Extract ratings for calculations
        const homeRatings = selectedHomePlayers.map(player => player.rating);
        const awayRatings = selectedAwayPlayers.map(player => player.rating);

        // Generate all possible permutations
        const permutations = this.permutationService.getPermutations();

        // Calculate probabilities for all possible matchups
        const results = this.calculateAllArrangements(
            permutations, homeRatings, awayRatings, selectedHomePlayers, selectedAwayPlayers
        );

        // Find the best strategies for each opponent type
        const strategiesResult = this.findBestStrategies(results);

        // Update app state
        this.appState.results = results;
        this.appState.strategies = strategiesResult.strategies;
        this.appState.opponentArrangements = strategiesResult.opponentArrangements;

        return {
            results,
            strategies: this.appState.strategies
        };
    }

    findBestStrategies(results) {
        // Find best strategy based on minimum win probability (minimax)
        const minimaxStrategy = this.findBestMinimaxStrategy(results);

        // Find best strategy based on win probability against opponent ordered by rank
        const orderedStrategy = this.findBestOrderedStrategy(results);

        // Find best strategy based on average win probability across all opponent permutations
        const averageStrategy = this.findBestAverageStrategy(results);

        // For average strategy, select the opponent with closest probability to the average
        const averageProb = averageStrategy.averageWinProb;
        const averageOpponent = averageStrategy.opponents.reduce((closest, current) => {
            const currentDiff = Math.abs(current.winProbability - averageProb);
            const closestDiff = Math.abs(closest.winProbability - averageProb);
            return currentDiff < closestDiff ? current : closest;
        }, averageStrategy.opponents[0]);

        return {
            strategies: {
                minimax: minimaxStrategy,
                ordered: orderedStrategy,
                average: averageStrategy
            },
            opponentArrangements: {
                minimax: minimaxStrategy.worstWinProbOpponent.arrangement,
                ordered: '1-2-3',
                average: averageOpponent.arrangement
            }
        };
    }

    calculateAllArrangements(permutations, homeRatings, awayRatings, selectedHomePlayers, selectedAwayPlayers) {
        const results = [];

        // Sort the permutations first to ensure consistent order
        permutations.sort((a, b) => {
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return a[i] - b[i];
            }
            return 0;
        });

        for (const homePermutation of permutations) {
            // Create home arrangement data
            const homeData = this.createHomeArrangementData(homePermutation, homeRatings, selectedHomePlayers);

            // Initialize team result object
            const teamResult = {
                arrangement: homeData.arrangement,
                permutation: homePermutation,
                playerNames: homeData.playerNames,
                opponents: [],
                worstCaseWinProb: 1.0,
                worstWinProbOpponent: null,
                orderedOpponentWinProb: 0,
                orderedOpponentMatchup: null,
                averageWinProb: 0
            };

            // Process all opponent permutations
            this.processOpponentPermutations(teamResult, permutations, homeData.playersMap, awayRatings, selectedAwayPlayers);

            // Calculate average win probability
            teamResult.averageWinProb = teamResult.opponents.reduce(
                (sum, opp) => sum + opp.winProbability, 0
            ) / teamResult.opponents.length;

            results.push(teamResult);
        }

        return results;
    }

    createHomeArrangementData(homePermutation, homeRatings, selectedHomePlayers) {
        // Map players to positions based on permutation
        const playersMap = {
            A: homeRatings[homePermutation[0]],
            B: homeRatings[homePermutation[1]],
            C: homeRatings[homePermutation[2]]
        };

        // Store player names for display
        const playerNames = {
            A: selectedHomePlayers[homePermutation[0]].name,
            B: selectedHomePlayers[homePermutation[1]].name,
            C: selectedHomePlayers[homePermutation[2]].name
        };

        // Create home arrangement string (1-based indexing)
        const arrangement = `${homePermutation[0]+1}-${homePermutation[1]+1}-${homePermutation[2]+1}`;

        return { playersMap, playerNames, arrangement };
    }

    processOpponentPermutations(teamResult, permutations, homePlayersMap, awayRatings, selectedAwayPlayers) {
        for (const awayPermutation of permutations) {
            // Calculate matchup result
            const opponentResult = this.calculateMatchupResult({
                homePlayersMap,
                awayPermutation,
                awayRatings,
                selectedAwayPlayers
            });

            // Add to team's opponents
            teamResult.opponents.push(opponentResult);

            // Track worst-case scenario for win probability
            if (opponentResult.winProbability < teamResult.worstCaseWinProb) {
                teamResult.worstCaseWinProb = opponentResult.winProbability;
                teamResult.worstWinProbOpponent = opponentResult;
            }

            // Check if this is the ordered opponent (1-2-3 arrangement)
            if (opponentResult.arrangement === '1-2-3') {
                teamResult.orderedOpponentWinProb = opponentResult.winProbability;
                teamResult.orderedOpponentMatchup = opponentResult;
            }
        }
    }

    calculateMatchupResult({ homePlayersMap, awayPermutation, awayRatings, selectedAwayPlayers }) {
        // Map players to positions based on permutation
        const awayPlayersMap = {
            X: awayRatings[awayPermutation[0]],
            Y: awayRatings[awayPermutation[1]],
            Z: awayRatings[awayPermutation[2]]
        };

        // Store player names for display
        const awayPlayersNameMap = {
            X: selectedAwayPlayers[awayPermutation[0]].name,
            Y: selectedAwayPlayers[awayPermutation[1]].name,
            Z: selectedAwayPlayers[awayPermutation[2]].name
        };

        const awayArrangement = `${awayPermutation[0]+1}-${awayPermutation[1]+1}-${awayPermutation[2]+1}`;

        // Calculate each match probability
        const matchProbabilities = [
            // A-Y
            this.probabilityService.calculateProbability(homePlayersMap.A, awayPlayersMap.Y),
            // B-X
            this.probabilityService.calculateProbability(homePlayersMap.B, awayPlayersMap.X),
            // C-Z
            this.probabilityService.calculateProbability(homePlayersMap.C, awayPlayersMap.Z),
            // A-X
            this.probabilityService.calculateProbability(homePlayersMap.A, awayPlayersMap.X),
            // BC-YZ (doubles)
            this.probabilityService.calculateProbability(
                (homePlayersMap.B + homePlayersMap.C) / 2,
                (awayPlayersMap.Y + awayPlayersMap.Z) / 2
            )
        ];

        // Calculate win probability (probability of winning at least 3 matches)
        const winProbability = this.probabilityService.calculateOverallWinProbability(matchProbabilities, this.permutationService);

        return {
            arrangement: awayArrangement,
            permutation: awayPermutation,
            playerNames: awayPlayersNameMap,
            matchProbabilities,
            winProbability
        };
    }

    // Find best strategy based on minimum win probability (minimax)
    findBestMinimaxStrategy(results) {
        return results.reduce((best, current) => {
            if (current.worstCaseWinProb > best.worstCaseWinProb) {
                return current;
            }
            return best;
        }, results[0]);
    }

    // Find best strategy based on win probability against opponent ordered by rank
    findBestOrderedStrategy(results) {
        return results.reduce((best, current) => {
            if (current.orderedOpponentWinProb > best.orderedOpponentWinProb) {
                return current;
            }
            return best;
        }, results[0]);
    }

    // Find best strategy based on average win probability across all opponent permutations
    findBestAverageStrategy(results) {
        return results.reduce((best, current) => {
            if (current.averageWinProb > best.averageWinProb) {
                return current;
            }
            return best;
        }, results[0]);
    }
}

// =====================================================================
// 6. UI COMPONENTS
// =====================================================================

class BaseComponent {
    constructor(appState) {
        this.appState = appState;
    }

    // Get container element
    getContainer(container) {
        if (typeof container === 'string') {
            return document.getElementById(container) || document.querySelector(container);
        }
        return container;
    }

    // Template method for rendering components
    render(container, data) {
        const containerElement = this.getContainer(container);
        if (!containerElement) return;

        // Clear container completely
        containerElement.innerHTML = '';

        // Build component content
        this.buildContent(containerElement, data);
    }

    // To be implemented by subclasses
    buildContent(containerElement, data) {
        throw new Error('buildContent method must be implemented by subclasses');
    }

    // Utility method for applying styles
    applyStyle(element, styleObject) {
        Object.entries(styleObject).forEach(([property, value]) => {
            element.style[property] = value;
        });
    }

    /**
     * Calculate a continuous color for a probability value
     * @param {number} probability - A value between 0 and 1
     * @returns {string} - CSS color in hsl format
     */
calculateProbabilityColor(probability) {
        // Ensure probability is between 0 and 1
        probability = Math.max(0, Math.min(1, probability));

        // Cubic interpolation function for smoother transitions
        const cubicEaseInOut = (t) => {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };

        if (probability < 0.5) {
            // Smooth transition from deep red to yellow
            // First half (0 to 0.5)
            if (probability < 0.25) {
                // Deep red to lighter red (0 to 0.25)
                const localT = cubicEaseInOut(probability * 4);
                const lightness = 80 + localT * 10;
                return `hsl(0, 100%, ${lightness}%)`;
            } else {
                // Lighter red to yellow (0.25 to 0.5)
                const localT = cubicEaseInOut((probability - 0.25) * 4);
                const hue = cubicEaseInOut(localT) * 60;
                return `hsl(${hue}, 95%, 90%)`;
            }
        } else {
            // Smooth transition from yellow to green
            // Second half (0.5 to 1)
            if (probability < 0.75) {
                // Yellow to green-yellow (0.5 to 0.75)
                const localT = cubicEaseInOut((probability - 0.5) * 4);
                const hue = 60 + localT * 60;
                return `hsl(${hue}, 95%, 90%)`;
            } else {
                // Green-yellow to deep green (0.75 to 1)
                const localT = cubicEaseInOut((probability - 0.75) * 4);
                const saturation = 80 + localT * 20;
                const lightness = 90 - localT * 15;
                return `hsl(120, ${saturation}%, ${lightness}%)`;
            }
        }
    }
}

class PlayerSelectionComponent extends BaseComponent {
    constructor(appState) {
        super(appState);
    }

    renderAll() {
        this.render('homePlayerSelections', {
            players: this.appState.homeTeam.players,
            teamType: 'home'
        });

        this.render('awayPlayerSelections', {
            players: this.appState.awayTeam.players,
            teamType: 'away'
        });

        this.appState.updateUrl();
    }

    buildContent(container, data) {
        const { players, teamType, selectedPlayerIndices = null } = data;

        // Create player positions
        for (let i = 0; i < 3; i++) {
            const rankNumber = i + 1; // 1, 2, 3
            const position = String.fromCharCode(65 + i); // A, B, C for home, X, Y, Z for away

            const selectionDiv = this.createPlayerSelectionRow(
                rankNumber, position, players, selectedPlayerIndices, i, teamType
            );
            container.appendChild(selectionDiv);
        }
    }

    createPlayerSelectionRow(rankNumber, position, players, selectedPlayerIndices, index, teamType) {
        const selectionDiv = document.createElement('div');
        selectionDiv.className = 'player-selection';
        selectionDiv.dataset.position = position;

        // Create label
        const label = document.createElement('label');
        label.textContent = `Rank ${rankNumber}:`;
        selectionDiv.appendChild(label);

        // Create player dropdown
        const select = this.createPlayerDropdown(
            rankNumber, position, players, selectedPlayerIndices, index, teamType
        );
        selectionDiv.appendChild(select);

        // Display rating
        const selectedIndex = selectedPlayerIndices ? selectedPlayerIndices[index] : index;
        const ratingInput = this.createRatingInput(players[selectedIndex], selectedIndex, teamType);
        selectionDiv.appendChild(ratingInput);

        return selectionDiv;
    }

    createPlayerDropdown(rankNumber, position, players, selectedPlayerIndices, index, teamType) {
        const select = document.createElement('select');
        select.className = 'player-selector';
        select.dataset.rank = rankNumber;
        select.dataset.position = position;

        // Add options for all players
        players.forEach((player, playerIndex) => {
            const option = document.createElement('option');
            option.value = playerIndex;
            option.textContent = player.toString();

            // Set selected option
            if (selectedPlayerIndices) {
                if (playerIndex === selectedPlayerIndices[index]) {
                    option.selected = true;
                }
            } else if (playerIndex === index) {
                option.selected = true;
            }

            select.appendChild(option);
        });

        // Add change event
        select.addEventListener('change', () => {
            this.handleSelectionChange(select, players, teamType);
        });

        return select;
    }

    handleSelectionChange(select, players, teamType) {
        // When selection changes, update rating display
        const playerIndex = parseInt(select.value);
        const ratingInput = select.parentNode.querySelector('.rating-display');
        ratingInput.value = players[playerIndex].rating;
        ratingInput.dataset.playerIndex = playerIndex;

        // Get the current selected player indices
        const containerId = teamType === 'home' ? 'homePlayerSelections' : 'awayPlayerSelections';
        const allSelectors = document.querySelectorAll(`#${containerId} .player-selector`);
        const selectedIndices = Array.from(allSelectors).map(s => parseInt(s.value));

        // Handle duplicate selections - replace with different player
        const currentPosition = Array.from(allSelectors).indexOf(select);
        this.handleDuplicateSelections(selectedIndices, playerIndex, currentPosition, players);

        // Sort selected players by rating
        const sortedIndices = this.getSortedPlayerIndices(selectedIndices, players);

        // Render with sorted selections
        this.render(containerId, {
            players: players,
            teamType: teamType,
            selectedPlayerIndices: sortedIndices
        });

        this.appState.updateUrl();

        // Recalculate strategy
        const calculator = new MatchCalculator(this.appState);
        calculator.calculateMatchProbabilities();

        // Trigger results display
        document.dispatchEvent(new CustomEvent('resultsUpdated'));
    }

    handleDuplicateSelections(selectedIndices, playerIndex, currentPosition, players) {
        for (let i = 0; i < selectedIndices.length; i++) {
            if (i !== currentPosition && selectedIndices[i] === playerIndex) {
                // Find an unused player
                for (let j = 0; j < players.length; j++) {
                    if (!selectedIndices.includes(j)) {
                        selectedIndices[i] = j;
                        break;
                    }
                }
            }
        }
    }

    getSortedPlayerIndices(selectedIndices, players) {
        // Sort selected players by rating
        const selectedPlayers = selectedIndices.map(idx => ({
            index: idx,
            rating: players[idx].rating
        }));
        selectedPlayers.sort((a, b) => b.rating - a.rating);

        // Get sorted indices
        return selectedPlayers.map(p => p.index);
    }

    createRatingInput(player, playerIndex, teamType) {
        const ratingInput = document.createElement('input');
        ratingInput.type = 'number';
        ratingInput.className = 'rating-display';
        ratingInput.value = player.rating;
        ratingInput.dataset.playerIndex = playerIndex;

        ratingInput.addEventListener('change', () => {
            this.handleRatingChange(ratingInput, teamType);
        });

        return ratingInput;
    }

    handleRatingChange(ratingInput, teamType) {
        // Update player rating
        const index = parseInt(ratingInput.dataset.playerIndex);
        const players = teamType === 'home'
            ? this.appState.homeTeam.players
            : this.appState.awayTeam.players;

        players[index].rating = parseInt(ratingInput.value);

        // Update dropdown text
        const select = ratingInput.parentNode.querySelector('.player-selector');
        const option = select.options[select.selectedIndex];
        option.textContent = players[index].toString();

        // Get current selected indices from all dropdowns
        const containerId = teamType === 'home' ? 'homePlayerSelections' : 'awayPlayerSelections';
        const allSelectors = document.querySelectorAll(`#${containerId} .player-selector`);
        const selectedIndices = Array.from(allSelectors).map(s => parseInt(s.value));

        // Ensure the current player is still selected
        if (!selectedIndices.includes(index)) {
            // If not selected, replace one player with this one
            selectedIndices[0] = index;
        }

        // Get sorted indices
        const sortedIndices = this.getSortedPlayerIndices(selectedIndices, players);

        // Render with sorted selections
        this.render(containerId, {
            players: players,
            teamType: teamType,
            selectedPlayerIndices: sortedIndices
        });

        this.appState.updateUrl();

        // Recalculate strategy
        const calculator = new MatchCalculator(this.appState);
        calculator.calculateMatchProbabilities();

        // Trigger results display
        document.dispatchEvent(new CustomEvent('resultsUpdated'));
    }
}

class StrategyCardComponent extends BaseComponent {
    constructor(appState) {
        super(appState);
    }

    buildContent(container, data) {
        const { results, strategies, homePlayers } = data;

        // Create cards for each optimized strategy
        const strategyTypes = Object.keys(strategies);

        strategyTypes.forEach(type => {
            const strategy = strategies[type];
            if (!strategy) return;

            const card = this.createStrategyCard(type, strategy, homePlayers);
            container.appendChild(card);
        });
    }

    createStrategyCard(type, strategy, homePlayers) {
        const card = document.createElement('div');
        card.className = `strategy-card ${type}-strategy`;
        card.dataset.arrangement = strategy.arrangement;

        // Add click event to show this strategy in the details view
        card.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('strategySelected', {
                detail: {
                    type: 'home-row',
                    arrangement: strategy.arrangement
                }
            }));
        });

        // Format title and description based on strategy type
        const { title, description, probability } = this.getStrategyInfo(type, strategy);

        // Create simplified player positions list
        const playerPositions = ['A', 'B', 'C'].map(pos => {
            const permIndex = strategy.permutation[pos.charCodeAt(0) - 65]; // A=0, B=1, C=2
            return `<li>${pos}: ${strategy.playerNames[pos]} (${homePlayers[permIndex].rating})</li>`;
        }).join('');

        card.innerHTML = `
            <div class="strategy-card-header">
                <h3>${title}</h3>
                <div class="arrangement-badge">${strategy.arrangement}</div>
            </div>
            <div class="strategy-card-body">
                <p class="strategy-description">${description}</p>
                <h4>Player Positions:</h4>
                <ul class="player-positions-list">
                    ${playerPositions}
                </ul>
            </div>
        `;

        return card;
    }

    getStrategyInfo(type, strategy) {
        let title = '';
        let description = '';
        let probability = 0;

        if (type === 'minimax') {
            title = 'Minimax';
            probability = strategy.worstCaseWinProb;
            description = `Guarantees at least ${(probability * 100).toFixed(1)}% win probability`;
        } else if (type === 'ordered') {
            title = 'Opponents 1-2-3';
            probability = strategy.orderedOpponentWinProb;
            description = `Achieves ${(probability * 100).toFixed(1)}% win probability against rank-ordered opponent`;
        } else if (type === 'average') {
            title = 'Opponents averaged';
            probability = strategy.averageWinProb;
            description = `Average ${(probability * 100).toFixed(1)}% win probability across all opponent permutations`;
        }

        return { title, description, probability };
    }
}

class HeatmapComponent extends BaseComponent {
    constructor(appState) {
        super(appState);
    }

    buildContent(container, data) {
        const { results, strategies } = data;

        // Add explanation above the heatmap
        this.addHeatmapExplanation(container);

        // Create the heatmap table
        const heatmapTable = this.createHeatmapTable(results, strategies);
        container.appendChild(heatmapTable);

        // Add legend after the table
        this.addHeatmapLegend(container);

        // Set minimax strategy as default selection
        this.updateHeatmapSelection('home-row', strategies.minimax.arrangement);
    }

    addHeatmapExplanation(container) {
        const heatmapExplanation = document.createElement('div');
        heatmapExplanation.className = 'heatmap-explanation';
        heatmapExplanation.innerHTML = `
            <p>This heatmap shows win probabilities for all possible home team permutations against all possible away team permutations.</p>
            <p>Click on any row or column header to view detailed match probabilities for that arrangement against all possible opponent arrangements.</p>
        `;
        container.appendChild(heatmapExplanation);
    }

    createHeatmapTable(results, strategies) {
        const heatmapTable = document.createElement('table');
        heatmapTable.id = 'winProbHeatmap';
        heatmapTable.className = 'heatmap-table';

        // Create table header
        const thead = this.createTableHeader(results[0].opponents);
        heatmapTable.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        for (const result of results) {
            const row = this.createHeatmapRow(result, results, strategies);
            tbody.appendChild(row);
        }
        heatmapTable.appendChild(tbody);

        return heatmapTable;
    }

    createTableHeader(opponents) {
        const thead = document.createElement('thead');
        thead.className = 'sticky-header';

        const headerRow1 = document.createElement('tr');
        headerRow1.innerHTML = `
            <th colspan="2" rowspan="2">Team Win<br>Probability</th>
            <th colspan="6">X-Y-Z</th>
        `;

        const headerRow2 = document.createElement('tr');
        const awayArrangements = opponents.map(o => o.arrangement);

        for (const arrangement of awayArrangements) {
            const th = document.createElement('th');
            th.textContent = arrangement;
            th.className = 'away-column-header';
            th.dataset.arrangement = arrangement;

            // Make column header clickable
            th.addEventListener('click', (e) => {
                document.dispatchEvent(new CustomEvent('strategySelected', {
                    detail: {
                        type: 'away-column',
                        arrangement: arrangement
                    }
                }));
                e.stopPropagation();
            });

            // Highlight the ordered arrangement
            if (arrangement === '1-2-3') {
                th.classList.add('ordered-arrangement');
            }
            headerRow2.appendChild(th);
        }

        thead.appendChild(headerRow1);
        thead.appendChild(headerRow2);
        return thead;
    }

    createHeatmapRow(result, results, strategies) {
        const row = document.createElement('tr');
        row.className = 'home-row';
        row.dataset.arrangement = result.arrangement;

        // Home team arrangement
        const headerCell = document.createElement('th');
        headerCell.className = 'home-row-header';
        headerCell.dataset.arrangement = result.arrangement;

        // Make row header clickable
        headerCell.addEventListener('click', (e) => {
            document.dispatchEvent(new CustomEvent('strategySelected', {
                detail: {
                    type: 'home-row',
                    arrangement: result.arrangement
                }
            }));
            e.stopPropagation();
        });

        this.styleRowHeader(headerCell, result, strategies);

        if (result === results[0]) {
            const teamHeader = document.createElement('th');
            teamHeader.textContent = 'A-B-C';
            teamHeader.setAttribute('rowspan', results.length);
            row.appendChild(teamHeader);
        }

        row.appendChild(headerCell);

        // Win probability cells
        for (const opponent of result.opponents) {
            const cell = this.createHeatmapCell(result, opponent, strategies);
            row.appendChild(cell);
        }

        return row;
    }

    styleRowHeader(headerCell, result, strategies) {
        // Apply appropriate CSS classes based on strategy type
        if (result === strategies.average) {
            // Average strategy gets row heading highlight with marker AND border
            headerCell.classList.add('average-strategy-header');
            // Add explicit border styling to ensure it appears
            headerCell.style.border = '3px solid var(--average-color)';
            headerCell.style.position = 'relative';
            headerCell.textContent = result.arrangement;
            const marker = document.createElement('span');
            marker.className = 'cell-marker average-marker';
            marker.textContent = 'A';
            headerCell.appendChild(marker);
        } else {
            // Regular rows just show arrangement
            headerCell.textContent = result.arrangement;
        }
    }

    createHeatmapCell(result, opponent, strategies) {
        const cell = document.createElement('td');

        // Win probability display
        const winProb = (opponent.winProbability * 100).toFixed(1) + '%';
        cell.className = 'heatmap-cell win-prob-cell';
        cell.dataset.homeArrangement = result.arrangement;
        cell.dataset.awayArrangement = opponent.arrangement;

        // Apply continuous color based on exact probability (new code)
        cell.style.backgroundColor = this.calculateProbabilityColor(opponent.winProbability);

        // Store the exact value (not rounded) for any other needs
        cell.dataset.value = opponent.winProbability.toFixed(3);

        // Highlight cells based on strategy type
        if (result === strategies.minimax && opponent === result.worstWinProbOpponent) {
            this.styleMinimaxCell(cell, winProb);
        } else if (result === strategies.ordered && opponent.arrangement === '1-2-3') {
            this.styleOrderedCell(cell, winProb);
        } else {
            cell.textContent = winProb;
        }

        return cell;
    }

    styleMinimaxCell(cell, winProb) {
        cell.classList.add('worst-case-win-prob');
        cell.setAttribute('data-tooltip', "Minimax strategy: This is the guaranteed minimum win probability regardless of opponent permutation");
        cell.textContent = winProb;
        const marker = document.createElement('span');
        marker.className = 'cell-marker minimax-marker';
        marker.textContent = 'M';
        cell.appendChild(marker);
    }

    styleOrderedCell(cell, winProb) {
        cell.classList.add('optimal-vs-ordered');
        cell.setAttribute('data-tooltip', "Ordered strategy: This is the win probability against an opponent using the standard 1-2-3 permutation");
        cell.textContent = winProb;
        const marker = document.createElement('span');
        marker.className = 'cell-marker ordered-marker';
        marker.textContent = 'O';
        cell.appendChild(marker);
    }

    addHeatmapLegend(container) {
        const legendContainer = document.createElement('div');
        legendContainer.className = 'heatmap-legend';
        legendContainer.innerHTML = `
            <span class="legend-title">Legend:</span>
            <div class="legend-item">
                <span class="legend-color minimax-legend"></span>
                <span>Minimax guarantee</span>
            </div>
            <div class="legend-item">
                <span class="legend-color ordered-legend"></span>
                <span>1-2-3 arrangement</span>
            </div>
            <div class="legend-item">
                <span class="legend-color average-legend"></span>
                <span>Average strategy row</span>
            </div>
            <div class="legend-item">
                <span class="legend-color selected-row-legend"></span>
                <span>Selected home arrangement</span>
            </div>
            <div class="legend-item">
                <span class="legend-color selected-col-legend"></span>
                <span>Selected away arrangement</span>
            </div>
        `;
        container.appendChild(legendContainer);
    }

    updateHeatmapSelection(type, arrangement) {
        // First, clear all previous selections
        document.querySelectorAll('.selected-row').forEach(el => el.classList.remove('selected-row'));
        document.querySelectorAll('.selected-column').forEach(el => el.classList.remove('selected-column'));

        // Update the app state
        this.appState.currentView = {
            type: type,
            arrangement: arrangement
        };

        if (type === 'home-row') {
            // Only highlight the row header
            const headerSelector = `.home-row-header[data-arrangement="${arrangement}"]`;
            const header = document.querySelector(headerSelector);
            if (header) {
                header.classList.add('selected-row');
            }
        } else if (type === 'away-column') {
            // Only highlight the column header
            const columnHeaderSelector = `.away-column-header[data-arrangement="${arrangement}"]`;
            const columnHeader = document.querySelector(columnHeaderSelector);
            if (columnHeader) {
                columnHeader.classList.add('selected-column');
            }
        }
    }
}

class MatchDetailsComponent extends BaseComponent {
    constructor(appState) {
        super(appState);
    }

    buildContent(container, data) {
        const { viewType, arrangement } = data;
        const results = this.appState.results;
        const homePlayers = this.appState.homeTeam.players;
        const awayPlayers = this.appState.awayTeam.players;

        // Determine what data we need based on view type
        let viewData = null;
        let viewTitle = '';
        let matchups = [];

        if (viewType === 'home-row') {
            // Process home row view
            ({ viewData, viewTitle, matchups } = this.processHomeRowView(arrangement, results));
        } else if (viewType === 'away-column') {
            // Process away column view
            ({ viewTitle, matchups } = this.processAwayColumnView(arrangement, results));
        }

        // Create the view container
        const viewContainer = document.createElement('div');
        viewContainer.className = 'multi-match-details';

        // Add appropriate class for the view type to enable CSS targeting
        if (viewType === 'home-row') {
            viewContainer.classList.add('home-row-view');
        } else if (viewType === 'away-column') {
            viewContainer.classList.add('away-column-view');
        }

        // Add header with view information
        this.addViewHeader(viewContainer, viewTitle);

        // Add player assignments section for BOTH teams
        this.addPlayerInfo(viewContainer, viewType, viewData, matchups, homePlayers, awayPlayers);

        // Create the multi-match table
        this.addMatchTable(viewContainer, viewType, matchups);

        // Add legend
        this.addMatchLegend(viewContainer);

        container.appendChild(viewContainer);
    }

    processHomeRowView(arrangement, results) {
        // Find the home team arrangement data
        const viewData = results.find(r => r.arrangement === arrangement);

        if (!viewData) return { viewData: null, viewTitle: '', matchups: [] };

        const viewTitle = `Home Team ${arrangement} vs All Away Permutations`;
        const matchups = viewData.opponents.map(opp => ({
            homeArrangement: arrangement,
            awayArrangement: opp.arrangement,
            homePlayerNames: viewData.playerNames,
            awayPlayerNames: opp.playerNames,
            matchProbabilities: opp.matchProbabilities,
            winProbability: opp.winProbability
        }));

        // Sort by arrangement to maintain consistent order with heatmap
        matchups.sort((a, b) => a.awayArrangement.localeCompare(b.awayArrangement));

        return { viewData, viewTitle, matchups };
    }

    processAwayColumnView(arrangement, results) {
        const viewTitle = `All Home Permutations vs Away Team ${arrangement}`;
        const matchups = [];

        // Collect all matchups with this away arrangement
        results.forEach(homeResult => {
            const opponent = homeResult.opponents.find(opp => opp.arrangement === arrangement);
            if (opponent) {
                matchups.push({
                    homeArrangement: homeResult.arrangement,
                    awayArrangement: arrangement,
                    homePlayerNames: homeResult.playerNames,
                    awayPlayerNames: opponent.playerNames,
                    matchProbabilities: opponent.matchProbabilities,
                    winProbability: opponent.winProbability
                });
            }
        });

        // Sort by arrangement to maintain consistent order with heatmap
        matchups.sort((a, b) => a.homeArrangement.localeCompare(b.homeArrangement));

        return { viewTitle, matchups };
    }

    addViewHeader(container, title) {
        const header = document.createElement('div');
        header.className = 'multi-match-header';
        header.innerHTML = `
            <h3>${title}</h3>
            <p class="view-description">Showing all possible matchups, sorted by arrangement to match the heatmap view.</p>
        `;
        container.appendChild(header);
    }

    addPlayerInfo(container, viewType, viewData, matchups, homePlayers, awayPlayers) {
        const playerInfo = document.createElement('div');
        playerInfo.className = 'fixed-team-info';

        if (viewType === 'home-row' && viewData) {
            this.addHomeRowPlayerInfo(playerInfo, viewData, awayPlayers);
        } else if (viewType === 'away-column' && matchups.length > 0) {
            this.addAwayColumnPlayerInfo(playerInfo, matchups, homePlayers, awayPlayers);
        }

        container.appendChild(playerInfo);
    }

    addHomeRowPlayerInfo(playerInfo, viewData, awayPlayers) {
        // Get home player ratings with positions A, B, C
        const homePlayerRatings = {};
        for (const position of ['A', 'B', 'C']) {
            const playerName = viewData.playerNames[position];
            const player = this.appState.homeTeam.players.find(p => p.name === playerName);
            homePlayerRatings[position] = player ? player.rating : '?';
        }

        // Get away team's top 3 players by rating for ranking numbers 1, 2, 3
        const topAwayPlayers = [...awayPlayers]
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 3);

        playerInfo.innerHTML = `
            <div class="team-players-container">
                <div class="team-players-row">
                    <h4>Fixed Home Team: ${viewData.arrangement}</h4>
                    <div class="player-lineup">
                        <span class="player-position"><strong>A:</strong> ${viewData.playerNames.A} (${homePlayerRatings.A})</span>
                        <span class="player-position"><strong>B:</strong> ${viewData.playerNames.B} (${homePlayerRatings.B})</span>
                        <span class="player-position"><strong>C:</strong> ${viewData.playerNames.C} (${homePlayerRatings.C})</span>
                    </div>
                </div>
                <div class="team-players-row">
                    <h4>Permuting Away Team</h4>
                    <div class="player-lineup">
                        <span class="player-position"><strong>1:</strong> ${topAwayPlayers[0].name} (${topAwayPlayers[0].rating})</span>
                        <span class="player-position"><strong>2:</strong> ${topAwayPlayers[1].name} (${topAwayPlayers[1].rating})</span>
                        <span class="player-position"><strong>3:</strong> ${topAwayPlayers[2].name} (${topAwayPlayers[2].rating})</span>
                    </div>
                </div>
            </div>
        `;
    }

    addAwayColumnPlayerInfo(playerInfo, matchups, homePlayers, awayPlayers) {
        // Get top home players by rating for ranking numbers 1, 2, 3
        const topHomePlayers = [...homePlayers]
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 3);

        // Get away player ratings with positions X, Y, Z
        const awayPlayerRatings = {};
        const opposingTeam = matchups[0]; // All matchups have the same away team info

        for (const position of ['X', 'Y', 'Z']) {
            const playerName = opposingTeam.awayPlayerNames[position];
            const player = awayPlayers.find(p => p.name === playerName);
            awayPlayerRatings[position] = player ? player.rating : '?';
        }

        playerInfo.innerHTML = `
            <div class="team-players-container">
                <div class="team-players-row">
                    <h4>Permuting Home Team</h4>
                    <div class="player-lineup">
                        <span class="player-position"><strong>1:</strong> ${topHomePlayers[0].name} (${topHomePlayers[0].rating})</span>
                        <span class="player-position"><strong>2:</strong> ${topHomePlayers[1].name} (${topHomePlayers[1].rating})</span>
                        <span class="player-position"><strong>3:</strong> ${topHomePlayers[2].name} (${topHomePlayers[2].rating})</span>
                    </div>
                </div>
                <div class="team-players-row">
                    <h4>Fixed Away Team: ${opposingTeam.awayArrangement}</h4>
                    <div class="player-lineup">
                        <span class="player-position"><strong>X:</strong> ${opposingTeam.awayPlayerNames.X} (${awayPlayerRatings.X})</span>
                        <span class="player-position"><strong>Y:</strong> ${opposingTeam.awayPlayerNames.Y} (${awayPlayerRatings.Y})</span>
                        <span class="player-position"><strong>Z:</strong> ${opposingTeam.awayPlayerNames.Z} (${awayPlayerRatings.Z})</span>
                    </div>
                </div>
            </div>
        `;
    }

    addMatchTable(container, viewType, matchups) {
        // Find indices of best and worst matchups
        const bestMatchupIndex = this.findIndexOfHighestWinProb(matchups);
        const worstMatchupIndex = this.findIndexOfLowestWinProb(matchups);

        const tableContainer = document.createElement('div');
        tableContainer.className = 'multi-match-table-container';

        // Match the table layout to the heatmap's orientation
        if (viewType === 'home-row') {
            // For home row, away arrangements should be columns (like in heatmap)
            this.createRowAsFixedColumnOrientedTable(tableContainer, matchups, bestMatchupIndex, worstMatchupIndex);
        } else {
            // For away column, home arrangements should be rows (like in heatmap)
            this.createColumnAsFixedRowOrientedTable(tableContainer, matchups, bestMatchupIndex, worstMatchupIndex);
        }

        container.appendChild(tableContainer);
    }

    createRowAsFixedColumnOrientedTable(container, matchups, bestMatchupIndex, worstMatchupIndex) {
        const table = document.createElement('table');
        table.className = 'multi-match-table';

        // Create the table header with away arrangements
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // First cell is empty/label
        const cornerCell = document.createElement('th');
        cornerCell.textContent = 'Match';
        headerRow.appendChild(cornerCell);

        // Add all away arrangements as columns (like in heatmap)
        matchups.forEach((matchup, index) => {
            const th = document.createElement('th');
            th.className = 'away-arrangement-header';

            // Add simple class-based highlighting
            if (index === bestMatchupIndex) {
                th.classList.add('best-matchup');
                this.applyStyle(th, APP_CONFIG.UI.STYLES.BEST_MATCHUP);
            } else if (index === worstMatchupIndex) {
                th.classList.add('worst-matchup');
                this.applyStyle(th, APP_CONFIG.UI.STYLES.WORST_MATCHUP);
            }

            th.textContent = matchup.awayArrangement;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create the table body with each row being a match type
        const tbody = document.createElement('tbody');

        // Match labels - create rows for each match type
        const matchLabels = ['A-Y', 'B-X', 'C-Z', 'A-X', 'BC-YZ', 'Win Probability'];

        matchLabels.forEach((label, matchIndex) => {
            const row = document.createElement('tr');

            // First column: match label
            const labelCell = document.createElement('td');
            labelCell.className = 'match-label';
            labelCell.textContent = label;
            row.appendChild(labelCell);

            // Add probability cells for each away arrangement
            matchups.forEach((matchup, arrangementIndex) => {
                const cell = document.createElement('td');

                // Add appropriate class based on cell type
                if (matchIndex < 5) {
                    // Individual match probability
                    this.createMatchProbabilityCell(cell, matchup.matchProbabilities[matchIndex]);
                } else {
                    // Win probability (last row)
                    this.createWinProbabilityCell(cell, matchup.winProbability, arrangementIndex, bestMatchupIndex, worstMatchupIndex);
                }

                row.appendChild(cell);
            });

            // Only make the Win Probability label cell bold, but don't color it
            if (matchIndex === 5) {  // Win Probability row
                labelCell.style.fontWeight = 'bold';
            }

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
    }

    createColumnAsFixedRowOrientedTable(container, matchups, bestMatchupIndex, worstMatchupIndex) {
        const table = document.createElement('table');
        table.className = 'multi-match-table';

        // Create header row with match labels
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // First cell: "Home"
        headerRow.innerHTML = `
            <th>Match</th>
            <th>A-Y</th>
            <th>B-X</th>
            <th>C-Z</th>
            <th>A-X</th>
            <th>BC-YZ</th>
            <th>Win Probability</th>
        `;
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create rows for each home arrangement
        const tbody = document.createElement('tbody');

        matchups.forEach((matchup, index) => {
            const row = document.createElement('tr');

            // Add class for highest/lowest win probability
            if (index === bestMatchupIndex) {
                row.classList.add('best-matchup');
            } else if (index === worstMatchupIndex) {
                row.classList.add('worst-matchup');
            }

            // First column: home arrangement (keep the existing style for this column)
            const arrangementCell = document.createElement('td');
            arrangementCell.className = 'home-arrangement';
            arrangementCell.textContent = matchup.homeArrangement;
            arrangementCell.setAttribute('data-arrangement', matchup.homeArrangement);
            row.appendChild(arrangementCell);

            // Add individual match probabilities
            matchup.matchProbabilities.forEach(prob => {
                const cell = document.createElement('td');
                this.createMatchProbabilityCell(cell, prob);
                row.appendChild(cell);
            });

            // Add win probability with halo effect
            const winProbCell = document.createElement('td');
            this.createWinProbabilityCell(winProbCell, matchup.winProbability, index, bestMatchupIndex, worstMatchupIndex);
            row.appendChild(winProbCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
    }

    createMatchProbabilityCell(cell, probability) {
        cell.textContent = `${(probability * 100).toFixed(1)}%`;
        cell.className = 'probability-cell';

        // Apply continuous color based on exact probability
        cell.style.backgroundColor = this.calculateProbabilityColor(probability);

        // Store the exact value for any other needs
        cell.dataset.value = probability.toFixed(3);

        return cell;
    }

    createWinProbabilityCell(cell, probability, index, bestIndex, worstIndex) {
        cell.className = 'win-probability';
        cell.textContent = `${(probability * 100).toFixed(1)}%`;

        // Calculate background color for the pseudo-element
        const bgColor = this.calculateProbabilityColor(probability);

        // Set the CSS custom property for the background
        cell.style.setProperty('--cell-bg-color', bgColor);

        // Restore the distinctive styling for win probability cells
        cell.style.fontWeight = 'bold';
        cell.style.position = 'relative';
        cell.style.zIndex = '1';

        // Only add classes for best/worst matchup identification
        // but don't apply direct styling (this will be handled by CSS)
        if (index === bestIndex) {
            cell.classList.add('best-matchup');
        } else if (index === worstIndex) {
            cell.classList.add('worst-matchup');
        }

        // Store the exact probability value
        cell.dataset.prob = probability.toFixed(3);

        return cell;
    }

    addMatchLegend(container) {
        const legend = document.createElement('div');
        legend.className = 'multi-match-legend';
        legend.innerHTML = `
            <div class="match-legend-item">
                <span class="match-legend-color" style="border: 2px solid #2e7d32;"></span>
                <span>Best matchup (highest win probability)</span>
            </div>
            <div class="match-legend-item">
                <span class="match-legend-color" style="border: 2px solid #c62828;"></span>
                <span>Worst matchup (lowest win probability)</span>
            </div>
        `;
        container.appendChild(legend);
    }

    // Helper method to find index of matchup with highest win probability
    findIndexOfHighestWinProb(matchups) {
        let maxIndex = 0;
        let maxProb = matchups[0]?.winProbability || 0;

        matchups.forEach((matchup, index) => {
            if (matchup.winProbability > maxProb) {
                maxProb = matchup.winProbability;
                maxIndex = index;
            }
        });

        return maxIndex;
    }

    // Helper method to find index of matchup with lowest win probability
    findIndexOfLowestWinProb(matchups) {
        let minIndex = 0;
        let minProb = matchups[0]?.winProbability || 1;

        matchups.forEach((matchup, index) => {
            if (matchup.winProbability < minProb) {
                minProb = matchup.winProbability;
                minIndex = index;
            }
        });

        return minIndex;
    }
}

class ResultsComponent extends BaseComponent {
    constructor(appState) {
        super(appState);
        this.strategyCardComponent = new StrategyCardComponent(appState);
        this.heatmapComponent = new HeatmapComponent(appState);
        this.matchDetailsComponent = new MatchDetailsComponent(appState);
    }

    displayResults() {
        // Get the strategies from appState
        const { strategies } = this.appState;
        const results = this.appState.results;
        const homePlayers = this.appState.homeTeam.players;

        // Clear previous results
        this.clearResultsContainer();

        // Create strategy cards
        this.strategyCardComponent.render('.strategy-cards-container', {
            results,
            strategies,
            homePlayers
        });

        // Create heatmap for win probabilities
        this.heatmapComponent.render('.heatmap-container', {
            results,
            strategies
        });

        // Set default view to show all matchups for minimax strategy
        this.renderMatchDetails('home-row', strategies.minimax.arrangement);
    }

    clearResultsContainer() {
        // Clear strategy cards container
        document.querySelector('.strategy-cards-container').innerHTML = '';

        // Clear heatmap container
        document.querySelector('.heatmap-container').innerHTML = '';

        // Clear strategy details
        document.getElementById('strategyDetails').innerHTML = '';
    }

    renderMatchDetails(viewType, arrangement) {
        this.matchDetailsComponent.render('#strategyDetails', {
            viewType,
            arrangement
        });

        // Update heatmap selection
        this.heatmapComponent.updateHeatmapSelection(viewType, arrangement);
    }
}

// =====================================================================
// 7. EVENT HANDLERS
// =====================================================================

class EventHandlers {
    constructor(appState, resultsComponent, playerSelectionComponent) {
        this.appState = appState;
        this.resultsComponent = resultsComponent;
        this.playerSelectionComponent = playerSelectionComponent;
    }

    addCustomPlayer(teamType) {
        const name = prompt('Enter player name:', 'Custom Player');
        if (!name) return;

        const rating = parseInt(prompt('Enter player rating:', '1500'));
        if (isNaN(rating)) return;

        this.appState.addCustomPlayer(teamType, name, rating);
        this.playerSelectionComponent.renderAll();

        // Recalculate
        const calculator = new MatchCalculator(this.appState);
        calculator.calculateMatchProbabilities();
        this.resultsComponent.displayResults();
    }

    setupEventListeners() {
        // Set up button event listeners
        document.getElementById('addHomePlayer').addEventListener('click',
            () => this.addCustomPlayer('home'));
        document.getElementById('addAwayPlayer').addEventListener('click',
            () => this.addCustomPlayer('away'));

        // Listen for strategy selection events
        document.addEventListener('strategySelected', event => {
            const { type, arrangement } = event.detail;
            this.resultsComponent.renderMatchDetails(type, arrangement);
        });

        // Listen for results updated events
        document.addEventListener('resultsUpdated', () => {
            this.resultsComponent.displayResults();
        });
    }
}

// =====================================================================
// 8. MAIN APPLICATION
// =====================================================================

class MatchAnalyzerApp {
    constructor() {
        this.appState = new AppState();
        this.playerSelectionComponent = new PlayerSelectionComponent(this.appState);
        this.resultsComponent = new ResultsComponent(this.appState);
        this.calculator = new MatchCalculator(this.appState);
        this.eventHandlers = new EventHandlers(
            this.appState,
            this.resultsComponent,
            this.playerSelectionComponent
        );
    }

    initialize() {
        // Initialize state
        this.appState.initialize();

        // Render UI
        this.playerSelectionComponent.renderAll();

        // Setup event handlers
        this.eventHandlers.setupEventListeners();

        // Update share URL
        document.getElementById('shareUrl').textContent = window.location.href;

        // Calculate and display initial results
        this.calculator.calculateMatchProbabilities();
        this.resultsComponent.displayResults();
    }
}

// Initialize app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new MatchAnalyzerApp();
    app.initialize();
});
