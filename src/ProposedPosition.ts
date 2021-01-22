import { Position } from 'vscode';


export interface ProposedPosition {
    value: Position;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean; // Signals to not put a blank line between.
}
