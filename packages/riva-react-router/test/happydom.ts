import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
// React reads this flag to know act() is available.
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
