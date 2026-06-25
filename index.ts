import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());


type TransactionType = 'transfer' | 'bill';
type TransactionStatus = 'pending' | 'completed';

interface Transaction {
    id: string;
    idempotencyKey: string;
    amount: number;
    recipientAccount: string;
    note?: string;
    type: TransactionType;
    status: TransactionStatus;
    createdAt: string;
}

const transactionSchema = z.object({
    idempotencyKey: z.string().min(10, 'Key is required'),
    amount: z.number().positive(),
    recipientAccount: z.string().min(10, 'recipientAccount is required'),
    note: z.string().optional(),
    type: z.enum(['transfer', 'bill'], {
        message: "type must be 'transfer' or 'bill'",
    }),
});

type TransactionInput = z.infer<typeof transactionSchema>;

const idempotencyStore = new Map<string, Transaction>();

function createTransaction(input: TransactionInput): Transaction {
    const tx: Transaction = {
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        amount: input.amount,
        recipientAccount: input.recipientAccount,
        type: input.type,
        status: 'completed',
        createdAt: new Date().toISOString(),
    };
    if (input.note !== undefined) tx.note = input.note;
    return tx;
}


function hasSamePayload(stored: Transaction, incoming: TransactionInput): boolean {
    return (
        stored.amount === incoming.amount &&
        stored.recipientAccount === incoming.recipientAccount &&
        stored.type === incoming.type
    );
}

app.post('/transactions', (req: Request, res: Response) => {
    const data = transactionSchema.safeParse(req.body);

    if (!data.success) {
        return res.status(400).json({
            error: 'Validation failed'
        });
    }

    const input = data.data;
    const key = idempotencyStore.get(input.idempotencyKey);

    if (key) {
        if (!hasSamePayload(key, input)) {
            return res.status(409).json({
                error: 'this key was already used with a different payload.',
            });
        }

        return res.status(200).json({ transaction: key });
    }

    const transaction = createTransaction(input);
    idempotencyStore.set(input.idempotencyKey, transaction);

    return res.status(201).json({ transaction });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
