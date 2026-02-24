import { Button } from '@monorepo/ui';
import { add, PI } from '@monorepo/utils';
import { capitalize } from '@monorepo/utils';

const result = add(1, 2);
const btn = Button({ label: 'hello', onClick: () => {} });
const cap = capitalize('hello');
const pi = PI;
