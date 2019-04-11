import { Moment } from 'moment';

export interface BotResponse {
    data?: {
        response: string,
        intent: string,
        options: any[]
    },
    error: false,
    msg?: string,
    type: 'message'|'error'
}

export enum AppState {
    READY,
    PENDING
}

export type Options = any[];

export interface Message {
    id: string,
    from: string, 
    type: 'simple'|'options',
    body: string|Options
}

export interface Log {
    id: string,
    timestamp: Moment,
    message: string
}

export interface Theme {
    primary: string,
    secondary: string,
    primaryGradient: [string, string],
    secondaryGradient: [string, string]
}

export interface Store {
    messages: Message[],
    socket: WebSocket|null,
    activeMessage: string,
    status: AppState,
    log: Log[],
    theme: Theme,
    themes: Theme[]
}