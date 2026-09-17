# Chess Deck

Chess Deck is a web workspace for practicing chess positions from decks. Its main flow is to choose a deck and position, analyze legal moves and variations on a board, submit the analysis for solution coverage, and record a review rating.

The existing product includes deck and position previews, review recommendations and due states, move-tree navigation and editing, solution comparison, manual solution saving where available, provisional-solution explanations, review save/retry handling, and progression to the next recommended position. Decks, solutions, and review schedules are supplied by the existing server APIs.

The interface supports desktop and narrow screens. Light and dark appearance are selectable and persisted locally. Preserve chess behavior, review behavior, route URLs, and server contracts when changing presentation.

The visual direction is a quiet, functional chess workspace: system typography, a chalk light palette with sage accents, a Lichess-based warm charcoal dark palette with blue accents and a brown board, flat bordered surfaces, and compact controls. The board and analysis are primary. Labels should describe the actual action or state without adding promotional claims.

See `DESIGN.md` for the implemented visual system, component APIs, and frontend source responsibilities.
