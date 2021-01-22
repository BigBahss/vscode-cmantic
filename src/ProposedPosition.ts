import { Position } from 'vscode';


export interface ProposedPosition {
    value: Position;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean;       // Signals to not put a blank line between.
    emptyScope?: boolean;   // Signals that the position is in an empty scope and may need to be indented.
}
