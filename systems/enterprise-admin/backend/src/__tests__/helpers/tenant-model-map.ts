import fs from 'fs';
import path from 'path';

const MODEL_BLOCK_PATTERN = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
const TENANT_ID_FIELD_PATTERN = /^\s*tenantId\s+/m;

export function tenantScopedModelsFromPrismaSchema(
    schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma'),
): string[] {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const models: string[] = [];

    for (const match of schema.matchAll(MODEL_BLOCK_PATTERN)) {
        const [, modelName, modelBody] = match;
        if (TENANT_ID_FIELD_PATTERN.test(modelBody)) {
            models.push(modelName);
        }
    }

    return models.sort();
}
