import React, { useState, useEffect } from 'react';
import cardsData from './cards.json';

const NUM_PLAYERS = 5; // 1 human + 4 AI
const HAND_SIZE = 5; // Initial hand size
const DRAW_PER_TURN = 2; // Cards drawn during Draw Phase
const STARTING_VOTES = 3;
const WIN_POWER_POINTS = 15; // Victory condition

// Define all game phases and their instructions
const gamePhases = [
  'Refresh phase',
  'Draw Phase',
  'Council Phase: Agenda Proposal',
  'Council Phase: Amendments',
  'Voting Phase',
  'Planning Phase: Operations',
  'Planning Phase: Utility/Reaction',
  'Planning Phase: Staff',
  'Planning Phase: Location Abilities',
  'Planning Phase: Abilities', // For Councilmember/Department abilities, not playing cards from hand
  'Incident Phase',
  'Clean-Up Phase',
];

const phaseInstructions = {
  'Refresh Phase': 'Ready all exhausted cards and remove temporary effects.',
  'Draw Phase': 'The active player draws 2 cards.',
  'Council Phase: Agenda Proposal': 'You may play 1 Agenda card from your hand to the Council Docket. Select a card and click "Play This Card".',
  'Council Phase: Amendments': 'Players may play 1 Utility/Reaction card to modify the proposed Agenda.',
  'Voting Phase': 'All players will now cast their vote on the proposed Agenda.',
  'Planning Phase: Operations': 'You may play up to 2 Operation (Event) cards per turn.',
  'Planning Phase: Utility/Reaction': 'You may play 1 Utility/Reaction card per turn.',
  'Planning Phase: Staff': 'You may play up to 1 Staff card per turn.',
  'Planning Phase: Location Abilities': 'You may play up to 2 Location cards from your hand onto your board.', // Clarified
  'Planning Phase: Abilities': 'You may use Councilmember or Department abilities.',
  'Incident Phase': 'Resolve one Incident card or triggered effects. Incidents impose penalties.',
  'Clean-Up Phase': 'Discard down to 7 cards in hand. Pass the first-player token. New turn starts on "Next Phase".',
};

// Helper to shuffle an array
const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

// Reusable Card Display Component
const CardDisplay = ({ card, onClick, isPlayable, isSelected, disabled }) => {
  if (!card) return null;

  const cardStyle = {
    padding: '6px 8px', // Reduced padding
    border: isSelected ? '2px solid #333' : '1px solid #ccc',
    background: isSelected ? '#e0e0ff' : (isPlayable ? '#d4edda' : '#fff'),
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: '6px',
    minWidth: '100px', // Smaller width, user requested
    minHeight: '120px',   // Smaller height, user requested (corrected typo from minheight)
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: '3px 3px 6px rgba(0,0,0,0.15)', // Corrected from 33px to 3px
    transition: 'transform 0.1s ease-in-out',
    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
    position: 'relative',
    fontSize: '1em', // Increased base font size
  };

  const cardTitleStyle = {
    fontSize: '1em', // Remains relative to base
    fontWeight: 'bold',
    marginBottom: '3px',
  };

  const cardTypeStyle = {
    fontSize: '0.7em', // Remains relative to base
    color: '#666',
    marginBottom: '8px',
  };

  const cardEffectStyle = {
    fontSize: '0.8em', // Remains relative to base
    fontStyle: 'italic',
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 4, // Adjusted line clamp for smaller height/larger text
    WebkitBoxOrient: 'vertical',
    flexGrow: 1,
  };

  return (
    <button style={cardStyle} onClick={onClick} disabled={disabled}>
      <div style={cardTitleStyle}>{card["Card Name"]}</div>
      <div style={cardTypeStyle}>{card["Type"]}</div>
      <div style={cardEffectStyle}>{card["Effect"]}</div>
      {isPlayable && !isSelected && (
        <div style={{ position: 'absolute', bottom: '3px', right: '3px', fontSize: '0.6em', color: 'darkgreen' }}>
          PLAYABLE
        </div>
      )}
    </button>
  );
};


function App() {
  const [playerHands, setPlayerHands] = useState([]);
  const [playerDecks, setPlayerDecks] = useState([]);
  const [playerDiscards, setPlayerDiscards] = useState([]);
  const [playerBoards, setPlayerBoards] = useState(Array(NUM_PLAYERS).fill([])); // Changed to array of arrays for all players
  const [playerRoles, setPlayerRoles] = useState([]); // Now stores full Councilmember card objects
  const [playerResources, setPlayerResources] = useState([]);

  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedCardIdx, setSelectedCardIdx] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [councilDocket, setCouncilDocket] = useState(null); // The Agenda card currently proposed
  const [cardsPlayedThisTurn, setCardsPlayedThisTurn] = useState({ Agenda: 0, Operation: 0, UtilityReaction: 0, Staff: 0, Location: 0 }); // Added Location
  const [totalVotesFor, setTotalVotesFor] = useState(0); // Votes cast FOR the current Agenda
  const [totalVotesAgainst, setTotalVotesAgainst] = useState(0); // Votes cast AGAINST the current Agenda
  const [playerHasVoted, setPlayerHasVoted] = useState(Array(NUM_PLAYERS).fill(false)); // Track if each player has voted in the current Voting Phase
  const [playerVotesCast, setPlayerVotesCast] = useState(Array(NUM_PLAYERS).fill({for: 0, against: 0})); // Track amount of votes cast by each player
  const [gameMessage, setGameMessage] = useState(''); // New state for temporary game messages
  const [isVotingInProgress, setIsVotingInProgress] = useState(false); // New state to manage automated voting sequence


  // Initial game setup
  useEffect(() => {
    initializeGame();
  }, []);

  const showGameMessage = (message, duration = 3000) => {
    setGameMessage(message);
    setTimeout(() => {
      setGameMessage('');
    }, duration);
  };

  const initializeGame = () => {
    const councilmemberCards = cardsData.filter(card => card["Type"] === 'Councilmember');
    const otherCards = cardsData.filter(card => card["Type"] !== 'Councilmember');

    if (councilmemberCards.length < NUM_PLAYERS) {
      alert("Not enough Councilmember cards for all players! Please add more Councilmember cards to cards.json.");
      return;
    }

    const shuffledCouncilmembers = shuffleArray(councilmemberCards);
    const assignedRoles = []; // Now stores full card objects
    for (let i = 0; i < NUM_PLAYERS; i++) {
      assignedRoles.push(shuffledCouncilmembers[i]); // Store the full card object
    }
    setPlayerRoles(assignedRoles);

    const shuffledDeck = shuffleArray(otherCards);
    const newDecks = Array.from({ length: NUM_PLAYERS }, () => []);
    const newHands = Array.from({ length: NUM_PLAYERS }, () => []);
    const newDiscards = Array.from({ length: NUM_PLAYERS }, () => []);
    const newPlayerBoards = Array.from({ length: NUM_PLAYERS }, () => []); // Initialize all boards

    shuffledDeck.forEach((card, idx) => {
      newDecks[idx % NUM_PLAYERS].push(card);
    });

    for (let i = 0; i < NUM_PLAYERS; i++) {
      newHands[i] = newDecks[i].splice(0, HAND_SIZE);
    }

    const initialResources = Array.from({ length: NUM_PLAYERS }, () => ({
      voteTokens: STARTING_VOTES,
      powerPoints: 0,
      goldCoins: 0,
    }));
    setPlayerResources(initialResources);

    setPlayerHands(newHands);
    setPlayerDecks(newDecks);
    setPlayerDiscards(newDiscards);
    setPlayerBoards(newPlayerBoards); // Set all player boards
    setSelectedCard(null);
    setSelectedCardIdx(null);
    setCurrentPlayer(0);
    setCurrentPhaseIndex(0);
    setCouncilDocket(null);
    setCardsPlayedThisTurn({ Agenda: 0, Operation: 0, UtilityReaction: 0, Staff: 0, Location: 0 }); // Reset all card play counts
    setTotalVotesFor(0);
    setTotalVotesAgainst(0); // Reset total votes against
    setPlayerHasVoted(Array(NUM_PLAYERS).fill().map(() => false));
    setPlayerVotesCast(Array(NUM_PLAYERS).fill().map(() => ({for: 0, against: 0})));
    setGameMessage('');
    setIsVotingInProgress(false); // Reset voting flag
  };

  const drawCards = (playerIndex, numCards) => {
    setPlayerHands((prevHands) => {
      const newHands = [...prevHands];
      setPlayerDecks((prevDecks) => {
        const newDecks = [...prevDecks];
        const cardsToDraw = Math.min(numCards, newDecks[playerIndex].length);

        for (let i = 0; i < cardsToDraw; i++) {
          newHands[playerIndex].push(newDecks[playerIndex].shift());
        }
        return newDecks;
      });
      return newHands;
    });
  };

  const discardCards = (playerIndex, cardsToDiscard) => {
    setPlayerHands((prevHands) => {
      const newHands = [...prevHands];
      setPlayerDiscards((prevDiscards) => {
        const newDiscards = [...prevDiscards];
        
        cardsToDiscard.forEach(card => {
          const cardIdx = newHands[playerIndex].findIndex(c => c === card);
          if (cardIdx > -1) {
            newHands[playerIndex].splice(cardIdx, 1);
            newDiscards[playerIndex].push(card);
          }
        });
        return newDiscards;
      });
      return newHands;
    });
  };

  const checkVictory = (updatedResources) => {
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (updatedResources[i].powerPoints >= WIN_POWER_POINTS) {
        alert(`${playerRoles[i]["Card Name"] || `Player ${i}`} has reached ${WIN_POWER_POINTS} Power Points and WINS THE GAME!`);
        initializeGame(); // Reset game for a new round
        return true;
      }
    }
    return false;
  };

  const applyCardEffect = (card, playerIndex) => {
      const effectText = card["Effect"] || "No specific effect.";
      showGameMessage(`${playerRoles[playerIndex]["Card Name"]} plays "${card["Card Name"]}" (${card["Type"]}). Effect: "${effectText}"`);
      // In the future, this is where you'd parse card["Effect"] and implement game logic
  };

  // Simplified castVote for automated voting
  const castVote = (playerIndex, voteAmount, voteType) => {
    setPlayerResources(prevResources => {
      const newResources = [...prevResources];
      // A player can only cast 1 vote total during the voting phase, regardless of how many tokens they have.
      // The amount of vote tokens simply determines if they *can* vote.
      if (newResources[playerIndex].voteTokens >= 1) { // Check if player has at least 1 vote token to cast.
        newResources[playerIndex].voteTokens -= 1; // Always deduct 1 token per vote cast.
        voteAmount = 1; // Ensure voteAmount is 1 when actually casting.
      } else {
        // If not enough tokens, player still 'votes' but with 0 impact
        voteAmount = 0; // Ensure 0 vote recorded if no tokens
      }

      setPlayerVotesCast(prevVotes => {
          const newVotes = [...prevVotes];
          const currentVotes = { ...newVotes[playerIndex] }; // Ensure we're working with a copy of the specific player's vote object
          if (voteType === 'for') {
              currentVotes.for += voteAmount;
              setTotalVotesFor(prev => prev + voteAmount);
          } else if (voteType === 'against') {
              currentVotes.against += voteAmount;
              setTotalVotesAgainst(prev => prev + voteAmount);
          }
          newVotes[playerIndex] = currentVotes;
          return newVotes;
      });

      setPlayerHasVoted(prev => {
        const newVoted = [...prev];
        newVoted[playerIndex] = true;
        return newVoted;
      });
      return newResources;
    });
  };

  // Helper function to resolve the Agenda vote after all players have cast their votes
  const resolveAgendaVote = (finalTotalFor, finalTotalAgainst, currentAgenda, finalPlayerVotesCast) => {
    if (!currentAgenda) {
        showGameMessage("No Agenda to resolve.", 2000);
        return;
    }
    const agendaVoteCost = parseInt(currentAgenda?.["Tags"]) || 0; 

    if (finalTotalFor >= agendaVoteCost && finalTotalFor > finalTotalAgainst) {
        showGameMessage(`Agenda "${currentAgenda["Card Name"]}" PASSED!`, 3000);
        setPlayerResources(prev => {
            const newRes = [...prev];
            newRes.forEach((res, idx) => {
                if (finalPlayerVotesCast[idx].for > 0) { // Players who voted FOR gain power
                    newRes[idx].powerPoints += (parseInt(currentAgenda["Power Value"]) || 1); 
                }
            });
            checkVictory(newRes); // Check for victory after updating resources
            return newRes;
        });
    } else {
        showGameMessage(`Agenda "${currentAgenda["Card Name"]}" FAILED!`, 3000);
    }
    // Discard the Agenda after voting
    setPlayerDiscards(prev => {
        const newDiscards = [...prev];
        newDiscards[0].push(currentAgenda); // Agenda goes to human discard for now
        return newDiscards;
    });

    setCouncilDocket(null); // Clear docket after resolution
    // Reset vote states for the next round
    setTotalVotesFor(0);
    setTotalVotesAgainst(0);
    setPlayerHasVoted(Array(NUM_PLAYERS).fill().map(() => false));
    setPlayerVotesCast(Array(NUM_PLAYERS).fill().map(() => ({for: 0, against: 0})));
  };

  const handleAICardPlay = (aiPlayerIndex, cardTypeToPlay, limit) => {
    setPlayerHands(prevHands => {
      const newHands = [...prevHands];
      const aiHand = newHands[aiPlayerIndex];
      let cardsPlayed = 0;
      let playedCards = [];

      // Create a temporary copy of the AI's hand to iterate over
      const tempAiHand = [...aiHand];

      for (let i = 0; i < tempAiHand.length && cardsPlayed < limit; i++) {
        const card = tempAiHand[i];
        if (card["Type"] === cardTypeToPlay || (cardTypeToPlay === 'Operation' && card["Type"] === 'Event')) { // 'Operation' is 'Event' type
          playedCards.push(card);
          applyCardEffect(card, aiPlayerIndex);

          if (cardTypeToPlay === 'Staff' || cardTypeToPlay === 'Location') {
            // Move to AI player's board
            setPlayerBoards(prevBoards => {
              const updatedBoards = [...prevBoards];
              updatedBoards[aiPlayerIndex] = [...updatedBoards[aiPlayerIndex], card];
              return updatedBoards;
            });
          } else {
            // For Operations/Utility, discard them immediately after effect
            setPlayerDiscards(prevDiscards => {
              const updatedDiscards = [...prevDiscards];
              updatedDiscards[aiPlayerIndex].push(card);
              return updatedDiscards;
            });
          }
          cardsPlayed++;
        }
      }
      // Remove played cards from AI hand
      newHands[aiPlayerIndex] = aiHand.filter(card => !playedCards.includes(card));
      return newHands;
    });
  };

  const advancePhase = () => {
    setSelectedCard(null);
    setSelectedCardIdx(null);

    const currentPhaseName = gamePhases[currentPhaseIndex];
    let nextPhaseIndex;
    let nextPlayer;

    // --- Special handling for Voting Phase (automated) ---
    if (currentPhaseName === 'Voting Phase') {
      if (!councilDocket) {
        showGameMessage("No Agenda to vote on. Advancing phase.", 2000);
        // Automatically advance to the next phase and player if no agenda
        nextPhaseIndex = (currentPhaseIndex + 1) % gamePhases.length;
        if (nextPhaseIndex === 0) { // If it wrapped around, advance player
          setCurrentPlayer(prevPlayer => (prevPlayer + 1) % NUM_PLAYERS);
        }
        setCurrentPhaseIndex(nextPhaseIndex);
        showGameMessage(`It's now ${playerRoles[(currentPlayer + 1) % NUM_PLAYERS]["Card Name"] || `Player ${(currentPlayer + 1) % NUM_PLAYERS}`}'s turn. Current Phase: ${gamePhases[nextPhaseIndex]}.`, 3000);
        return; // Exit here, as phase is handled
      }

      if (isVotingInProgress) {
        showGameMessage("Voting is currently in progress. Please wait.", 2000);
        return; // Prevent multiple clicks during automated sequence
      }

      // If we reach here, it's the Voting Phase, there's a docket, and voting hasn't started yet.
      setIsVotingInProgress(true);
      showGameMessage("Voting Phase started! All players will now cast their votes.", 3000);

      // Reset votes for a fresh voting process (ensure unique objects)
      setTotalVotesFor(0);
      setTotalVotesAgainst(0);
      setPlayerHasVoted(Array(NUM_PLAYERS).fill().map(() => false));
      setPlayerVotesCast(Array(NUM_PLAYERS).fill().map(() => ({for: 0, against: 0})));


      let voteDelay = 1000; // 1 second delay between votes
      let cumulativeDelay = 0; // Tracks total delay for scheduling

      // Schedule votes for all players
      for (let i = 0; i < NUM_PLAYERS; i++) {
        const playerIdx = i;
        cumulativeDelay += voteDelay;

        setTimeout(() => {
          // These snapshots are important for the closure in setTimeout
          const currentResSnapshot = playerResources;
          const currentCouncilDocketSnapshot = councilDocket;
          const currentRolesSnapshot = playerRoles;

          // Each player casts exactly 1 vote if they have tokens
          if (currentResSnapshot[playerIdx].voteTokens >= 1 && currentCouncilDocketSnapshot) { // Check for at least 1 token
            let voteType = 'against'; // Default vote type

            if (playerIdx === 0) { // Human player always votes FOR their proposed Agenda
                voteType = 'for';
                showGameMessage(`${currentRolesSnapshot[playerIdx]["Card Name"]} (You) votes FOR their Agenda!`, 2000);
            } else { // AI player voting logic
                const aiCouncilmember = currentRolesSnapshot[playerIdx];
                // Ensure factions and departments are arrays, even if empty or single string
                const aiFactions = typeof aiCouncilmember["Factions"] === 'string' ? aiCouncilmember["Factions"].split(',').map(f => f.trim()) : (Array.isArray(aiCouncilmember["Factions"]) ? aiCouncilmember["Factions"].map(f => f.trim()) : []);
                const aiDepartments = typeof aiCouncilmember["Departments"] === 'string' ? aiCouncilmember["Departments"].split(',').map(d => d.trim()) : (Array.isArray(aiCouncilmember["Departments"]) ? aiCouncilmember["Departments"].map(d => d.trim()) : []);

                const agendaFactions = typeof currentCouncilDocketSnapshot["Factions"] === 'string' ? currentCouncilDocketSnapshot["Factions"].split(',').map(f => f.trim()) : (Array.isArray(currentCouncilDocketSnapshot["Factions"]) ? currentCouncilDocketSnapshot["Factions"].map(f => f.trim()) : []);
                const agendaDepartments = typeof currentCouncilDocketSnapshot["Departments"] === 'string' ? currentCouncilDocketSnapshot["Departments"].split(',').map(d => d.trim()) : (Array.isArray(currentCouncilDocketSnapshot["Departments"]) ? currentCouncilDocketSnapshot["Departments"].map(d => d.trim()) : []);
                const agendaPowerValue = parseInt(currentCouncilDocketSnapshot["Power Value"]) || 0;

                const hasFactionSynergy = aiFactions.some(f => agendaFactions.includes(f));
                const hasDeptSynergy = aiDepartments.some(d => agendaDepartments.includes(d));

                // Basic AI decision: if synergy or positive power, vote FOR, else AGAINST
                if (hasFactionSynergy || hasDeptSynergy || agendaPowerValue > 0) { // If there's any positive reason
                    voteType = Math.random() < 0.8 ? 'for' : 'against'; // 80% chance to vote FOR with synergy/positive power
                    showGameMessage(`${aiCouncilmember["Card Name"]} considers the Agenda. Votes ${voteType === 'for' ? 'FOR' : 'AGAINST'}.`, 2000);
                } else {
                    voteType = Math.random() < 0.3 ? 'for' : 'against'; // 30% chance to vote FOR without synergy/positive power
                    showGameMessage(`${aiCouncilmember["Card Name"]} considers the Agenda. Votes ${voteType === 'for' ? 'FOR' : 'AGAINST'}.`, 2000);
                }
            }
            // Execute the vote, always casting 1 vote
            castVote(playerIdx, 1, voteType);

          } else {
            showGameMessage(`${currentRolesSnapshot[playerIdx]["Card Name"]} had no vote tokens or no Agenda.`, 2000);
            setPlayerHasVoted(prev => { // Mark as voted even if no tokens or no agenda
                const newVoted = [...prev];
                newVoted[playerIdx] = true;
                return newVoted;
            });
          }
        }, cumulativeDelay); // Schedule each player's vote

        // After all votes are scheduled, schedule the final resolution and phase advance
        if (i === NUM_PLAYERS - 1) { // This is the last player whose vote is being scheduled
            setTimeout(() => {
                // Read latest state values for resolution
                setTotalVotesFor(finalFor => {
                    setTotalVotesAgainst(finalAgainst => {
                        setPlayerVotesCast(finalPlayerVotesCast => { // Get final playerVotesCast
                            resolveAgendaVote(finalFor, finalAgainst, councilDocket, finalPlayerVotesCast); // Resolve with final counts
                            setIsVotingInProgress(false); // Voting sequence complete

                            // Now, automatically advance the phase for the game
                            setCurrentPhaseIndex(prevPhase => {
                                let newPhaseIndex = prevPhase + 1;
                                let newPlayer = (currentPlayer + 1) % NUM_PLAYERS; // Correctly advance player after voting is done

                                if (newPhaseIndex >= gamePhases.length) {
                                    newPhaseIndex = 0;
                                }
                                setCurrentPlayer(newPlayer); // Set the new player here
                                showGameMessage(`Voting complete! It's now ${playerRoles[newPlayer]["Card Name"] || `Player ${newPlayer}`}'s turn. Current Phase: ${gamePhases[newPhaseIndex]}.`, 3000);
                                return newPhaseIndex;
                            });
                            return finalPlayerVotesCast; // Return unchanged
                        });
                        return finalAgainst; // Return unchanged
                    });
                    return finalFor; // Return unchanged
                });
            }, cumulativeDelay + voteDelay); // Schedule resolution slightly after the last vote
        }
      }
      return; // Crucial: Exit advancePhase. The timeouts manage subsequent progression.
    }

    // --- General phase advancement logic for non-voting phases ---
    // (This part will only be reached if currentPhaseName is NOT 'Voting Phase' or if voting just completed and auto-advanced.)
    nextPhaseIndex = currentPhaseIndex + 1;
    nextPlayer = currentPlayer; // Default to current player, will advance at end of phase cycle

    if (nextPhaseIndex >= gamePhases.length) {
        nextPhaseIndex = 0;
        nextPlayer = (currentPlayer + 1) % NUM_PLAYERS; // Advance player at start of new round
    }

    // AI player actions for non-voting phases (moved from previous conditional blocks)
    if (currentPlayer !== 0) { // If it's an AI player's turn for a non-voting phase
        if (currentPhaseName === 'Draw Phase') {
            drawCards(currentPlayer, DRAW_PER_TURN);
            showGameMessage(`${playerRoles[currentPlayer]["Card Name"]} drew 2 cards.`, 2000);
        } else if (currentPhaseName === 'Council Phase: Agenda Proposal') {
            const aiHand = playerHands[currentPlayer];
            const agendaCardIdx = aiHand.findIndex(card => card["Type"] === 'Agenda');
            if (agendaCardIdx > -1) {
              const cardToPlay = aiHand[agendaCardIdx];
              setCouncilDocket(cardToPlay);
              setPlayerHands(prevHands => {
                const newHands = [...prevHands];
                newHands[currentPlayer] = aiHand.filter((_, idx) => idx !== agendaCardIdx);
                return newHands;
              });
              setCardsPlayedThisTurn(prev => ({ ...prev, Agenda: prev.Agenda + 1 }));
              showGameMessage(`${playerRoles[currentPlayer]["Card Name"]} proposed Agenda: "${cardToPlay["Card Name"]}".`, 3000);
            } else {
                showGameMessage(`${playerRoles[currentPlayer]["Card Name"]} had no Agenda to propose.`, 2000);
            }
        } else if (currentPhaseName === 'Planning Phase: Operations') {
            handleAICardPlay(currentPlayer, 'Operation', 2);
        } else if (currentPhaseName === 'Planning Phase: Utility/Reaction') {
            handleAICardPlay(currentPlayer, 'Utility/Reaction', 1);
        } else if (currentPhaseName === 'Planning Phase: Staff') {
            handleAICardPlay(currentPlayer, 'Staff', 1);
        } else if (currentPhaseName === 'Planning Phase: Location Abilities') {
            handleAICardPlay(currentPlayer, 'Location', 2);
        } else if (currentPhaseName === 'Planning Phase: Abilities') {
            showGameMessage(`${playerRoles[currentPlayer]["Card Name"]} considers using an ability. (Not implemented yet)`, 2000);
        } else if (currentPhaseName === 'Clean-Up Phase') {
            setCardsPlayedThisTurn({ Agenda: 0, Operation: 0, UtilityReaction: 0, Staff: 0, Location: 0 }); // Reset for new turn
            setCouncilDocket(null);
        }
    } else { // Human player actions for non-voting phases
      if (currentPhaseName === 'Draw Phase') {
          drawCards(0, DRAW_PER_TURN);
          showGameMessage("You drew 2 cards.", 2000);
      }
      else if (currentPhaseName === 'Clean-Up Phase') {
          const humanHand = playerHands[0];
          if (humanHand.length > 7) {
              showGameMessage(`You had ${humanHand.length} cards, discarding ${humanHand.length - 7} oldest cards.`, 3000);
              const cardsToDiscard = humanHand.slice(0, humanHand.length - 7);
              discardCards(0, cardsToDiscard);
          } else {
              showGameMessage("Hand size is within limit. No discards needed.", 2000);
          }
          setCardsPlayedThisTurn({ Agenda: 0, Operation: 0, UtilityReaction: 0, Staff: 0, Location: 0 }); // Reset for new turn
          setCouncilDocket(null); // Clear docket at end of turn
      }
    }

    setCurrentPhaseIndex(nextPhaseIndex);
    setCurrentPlayer(nextPlayer); // Set player for the *next* phase
    showGameMessage(`It's now ${playerRoles[nextPlayer]["Card Name"] || `Player ${nextPlayer}`}'s turn. Current Phase: ${gamePhases[nextPhaseIndex]}.`, 3000);
  };

  const humanHand = playerHands[0] || [];
  const humanDeckSize = (playerDecks[0] && playerDecks[0].length) || 0;
  const humanDiscardSize = (playerDiscards[0] && playerDiscards[0].length) || 0;
  const humanResources = playerResources[0] || { voteTokens: 0, powerPoints: 0, goldCoins: 0 };
  const humanBoard = playerBoards[0] || []; // Human player's board
  const humanRole = playerRoles[0] ? playerRoles[0]["Card Name"] : "Human Player";

  const currentPhaseName = gamePhases[currentPhaseIndex];

  const isCardPlayableInPhase = (card) => {
    if (currentPlayer !== 0) return false; // Only human player can play cards from hand

    switch (currentPhaseName) {
      case 'Council Phase: Agenda Proposal':
        return card["Type"] === 'Agenda' && cardsPlayedThisTurn.Agenda < 1;
      case 'Council Phase: Amendments':
        return card["Type"] === 'Utility/Reaction' && cardsPlayedThisTurn.UtilityReaction < 1;
      case 'Planning Phase: Operations':
        return card["Type"] === 'Operation' && cardsPlayedThisTurn.Operation < 2;
      case 'Planning Phase: Utility/Reaction':
        return card["Type"] === 'Utility/Reaction' && cardsPlayedThisTurn.UtilityReaction < 1;
      case 'Planning Phase: Staff':
        return card["Type"] === 'Staff' && cardsPlayedThisTurn.Staff < 1;
      case 'Planning Phase: Location Abilities':
        // In this phase, you can play a Location card from your hand to your board.
        return card["Type"] === 'Location' && cardsPlayedThisTurn.Location < 2;
      default:
        return false;
    }
  };

  const playSelectedCard = () => {
    if (currentPlayer !== 0 || selectedCardIdx === null) return;

    const card = humanHand[selectedCardIdx];

    if (!isCardPlayableInPhase(card)) {
      showGameMessage(`You cannot play a "${card["Type"]}" card in the "${currentPhaseName}" or have exceeded the limit for this phase.`, 3000);
      return;
    }

    const cardType = card["Type"];
    let shouldRemoveFromHand = true;

    switch (cardType) {
      case 'Agenda':
        setCouncilDocket(card);
        setCardsPlayedThisTurn(prev => ({ ...prev, Agenda: prev.Agenda + 1 }));
        showGameMessage(`You proposed Agenda: "${card["Card Name"]}".`, 3000);
        break;
      case 'Operation':
        discardCards(0, [card]);
        setCardsPlayedThisTurn(prev => ({ ...prev, Operation: prev.Operation + 1 }));
        applyCardEffect(card, 0); // Apply effect and then discard
        break;
      case 'Utility/Reaction':
        discardCards(0, [card]);
        setCardsPlayedThisTurn(prev => ({ ...prev, UtilityReaction: prev.UtilityReaction + 1 }));
        applyCardEffect(card, 0); // Apply effect and then discard
        break;
      case 'Staff':
      case 'Location':
        setPlayerBoards(prevBoards => { // Update human player's board
          const updatedBoards = [...prevBoards];
          updatedBoards[0] = [...updatedBoards[0], card];
          return updatedBoards;
        });
        setCardsPlayedThisTurn(prev => ({ ...prev, [cardType]: prev[cardType] + 1 }));
        applyCardEffect(card, 0); // Apply effect and move to board
        break;
      default:
        showGameMessage(`Playing "${card["Card Name"]}" (Type: ${card["Type"]}) is not yet fully implemented for its effects.`, 3000);
        shouldRemoveFromHand = false; // Prevents it from being removed if its type isn't fully handled
        break;
    }

    if (shouldRemoveFromHand) {
      setPlayerHands(prevHands => {
        const newHands = [...prevHands];
        newHands[0] = humanHand.filter((_, idx) => idx !== selectedCardIdx);
        return newHands;
      });
    }
    setSelectedCard(null);
    setSelectedCardIdx(null);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1.5fr 1.5fr', // Left (AI), Middle (Main Game), Right (Selected Card Details)
      gridTemplateRows: 'auto auto auto 1fr', // Header, Message, Your Hand, Main Content Area
      gap: '20px',
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
    }}>
      {/* Header / Controls - Row 1 */}
      <div style={{ gridColumn: '1 / span 3', gridRow: '1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #ddd' }}>
        <h1>Berkeley City Council Card Game</h1>
        <button onClick={initializeGame} style={{ padding: '10px 15px', fontSize: '16px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>
          Deal New Game
        </button>
      </div>

      {/* Game Message Display - Row 2 */}
      {gameMessage && (
        <div style={{
          gridColumn: '1 / span 3', gridRow: '2',
          textAlign: 'center',
          backgroundColor: '#ffc107',
          color: '#333',
          padding: '10px',
          borderRadius: '5px',
          fontWeight: 'bold',
          transition: 'opacity 0.5s ease-out',
          opacity: gameMessage ? 1 : 0,
        }}>
          {gameMessage}
        </div>
      )}

      {/* Bottom Row: Your Hand - Now Row 3, Full Width */}
      <div style={{ gridColumn: '1 / span 3', gridRow: '3', padding: '15px', borderTop: '1px solid #ddd', background: '#fff', boxShadow: '0 -2px 5px rgba(0,0,0,0.1)' }}>
        <h2>Your Hand ({humanHand.length} cards)</h2>
        <p style={{fontSize: '0.9em'}}>
          Deck: {humanDeckSize} cards | 
          Discard: {humanDiscardSize} cards | 
          <span style={{ marginLeft: '15px', fontWeight: 'bold' }}>Votes: {humanResources.voteTokens}</span> | 
          <span style={{ marginLeft: '10px', fontWeight: 'bold' }}>Power: {humanResources.powerPoints}</span> | 
          <span style={{ marginLeft: '10px', fontWeight: 'bold' }}>Gold: {humanResources.goldCoins}</span>
        </p>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 0' }}>
          {humanHand.length > 0 ? (
            humanHand.map((card, idx) => (
              <CardDisplay
                key={idx}
                card={card}
                onClick={() => {
                  setSelectedCard(card);
                  setSelectedCardIdx(idx);
                }}
                isPlayable={isCardPlayableInPhase(card)}
                isSelected={selectedCardIdx === idx}
                disabled={currentPlayer !== 0}
              />
            ))
          ) : (
            <p>Your hand is empty.</p>
          )}
        </div>
      </div>

      {/* Left Column: AI Players - Row 4, Col 1 */}
      <div style={{ gridColumn: '1 / 2', gridRow: '4', padding: '15px', border: '1px solid #eee', borderRadius: '8px', background: '#fff', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }}>
        <h2>AI Players</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {playerRoles.slice(1).map((roleCard, idx) => ( // Use roleCard (full object) here
            <li key={idx} style={{ marginBottom: '10px', padding: '8px', borderBottom: '1px dotted #ccc', background: currentPlayer === (idx + 1) ? '#ffe0e0' : 'transparent', borderRadius: '5px' }}>
              <span style={{ fontWeight: 'bold' }}>{roleCard["Card Name"]}</span> {/* Display Councilmember name */}
              <div style={{ fontSize: '0.8em', color: '#777' }}>
                Votes: {playerResources[idx + 1]?.voteTokens || 0} | 
                Power: {playerResources[idx + 1]?.powerPoints || 0} | 
                Gold: {playerResources[idx + 1]?.goldCoins || 0}
              </div>
              {/* Display AI's in-play cards */}
              {playerBoards[idx + 1] && playerBoards[idx + 1].length > 0 && (
                <div style={{ marginTop: '5px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75em', fontWeight: 'bold' }}>In Play:</span>
                  {/* Hiding AI's specific in-play cards for now as per previous instruction */}
                  <span style={{fontSize: '0.75em'}}>({playerBoards[idx + 1].length} cards)</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Middle Column: Main Game Area - Row 4, Col 2 */}
      <div style={{ gridColumn: '2 / 3', gridRow: '4', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Current Turn & Phase Info */}
        <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', background: '#e9f7ef', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }}>
          <h2>Current Player: <span style={{ color: currentPlayer === 0 ? 'darkgreen' : 'darkred' }}>{playerRoles[currentPlayer] ? playerRoles[currentPlayer]["Card Name"] : `Player ${currentPlayer}`}</span></h2>
          <h2>Current Phase: {currentPhaseName}</h2>
          <p style={{ fontStyle: 'italic', color: '#555' }}>{phaseInstructions[currentPhaseName]}</p>
          <button
            onClick={advancePhase}
            disabled={isVotingInProgress} // Disable button during automated voting
            style={{ padding: '8px 12px', fontSize: '14px', cursor: 'pointer', marginTop: 10, background: '#0056b3', color: 'white', border: 'none', borderRadius: '5px' }}
          >
            Next Phase
          </button>
        </div>

        {/* Council Docket */}
        <div style={{ border: '2px dashed #a0a0a0', padding: '15px', borderRadius: '10px', background: '#f0f0f0', minHeight: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)' }}>
          <h2>Council Docket</h2>
          {councilDocket ? (
            <>
              <CardDisplay card={councilDocket} disabled={true} />
              <p style={{marginTop: '10px', fontWeight: 'bold'}}>Vote Cost: {parseInt(councilDocket["Tags"]) || 0} | <span style={{color: 'green'}}>Votes For: {totalVotesFor}</span> | <span style={{color: 'red'}}>Votes Against: {totalVotesAgainst}</span></p>
              
              <div style={{ width: '100%', maxWidth: '300px', marginTop: '10px', textAlign: 'left' }}>
                <h4 style={{marginBottom: '5px'}}>Votes Cast:</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {playerVotesCast.map((votes, idx) => (
                    // Only display players who actually cast a vote (for or against)
                    (votes.for > 0 || votes.against > 0) && (
                      <li key={idx} style={{ fontSize: '0.9em' }}>
                        {playerRoles[idx]["Card Name"]}: 
                        {votes.for > 0 && <span style={{ color: 'darkgreen', marginLeft: '5px' }}>{votes.for} FOR</span>}
                        {votes.against > 0 && <span style={{ color: 'darkred', marginLeft: '5px' }}>{votes.against} AGAINST</span>}
                      </li>
                    )
                  ))}
                </ul>
              </div>

            </>
          ) : (
            <p>No card currently proposed.</p>
          )}
          {/* Human player vote buttons removed as voting is now automated */}
        </div>

        {/* Human Player's Board (In-Play Area) */}
        <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', background: '#fff', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)', minHeight: '150px' }}>
            <h2>Your Board (Locations & Staff in Play)</h2>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {humanBoard.length > 0 ? (
                    humanBoard.map((card, idx) => (
                        <CardDisplay key={idx} card={card} disabled={true} />
                    ))
                ) : (
                    <p>No cards in play on your board.</p>
                )}
            </div>
        </div>

      </div>

      {/* Right Column: Card Details / Play Button - Now Row 4, Col 3 */}
      <div style={{ gridColumn: '3 / 4', gridRow: '4', padding: '15px', border: '1px solid #eee', borderRadius: '8px', background: '#fff', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }}>
        <h2>Selected Card Details</h2>
        {selectedCard ? (
          <div style={{ padding: '10px', border: '1px solid #007bff', borderRadius: '8px', background: '#eaf4ff', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '350px' }}>
            <h3>{selectedCard["Card Name"]} ({selectedCard["Type"]})</h3>
            <p style={{fontSize: '0.9em'}}><strong>Subtype:</strong> {selectedCard["Subtype"]}</p>
            <p style={{fontSize: '0.9em'}}><strong>Factions:</strong> {selectedCard["Factions"]}</p>
            <p style={{fontSize: '0.9em'}}><strong>Departments:</strong> {selectedCard["Departments"]}</p>
            <p style={{fontSize: '0.9em'}}><strong>Tags:</strong> {selectedCard["Tags"]}</p>
            <p style={{fontSize: '0.9em'}}><strong>Effect:</strong> {selectedCard["Effect"]}</p>
            {currentPlayer === 0 && selectedCardIdx !== null && (
              <button
                onClick={playSelectedCard}
                disabled={!isCardPlayableInPhase(selectedCard)}
                style={{ padding: '8px 12px', fontSize: '14px', cursor: 'pointer', marginTop: 10, background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}
              >
                Play This Card
              </button>
            )}
          </div>
        ) : (
          <p style={{fontSize: '0.9em'}}>Click a card in your hand to see details.</p>
        )}
      </div>
    </div>
  );
}

export default App;