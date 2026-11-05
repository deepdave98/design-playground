import { mountDemo } from './scene';
import './styles.css';

const dispose = mountDemo(document.querySelector<HTMLElement>('#crt-demo')!);
import.meta.hot?.dispose(dispose);
