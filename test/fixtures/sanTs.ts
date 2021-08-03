let text = 'test';
class Test {
    template = `
        <video
            on-loadeddata="onClick"
            on-xxx="onClick"
            class="${text}"
            src="xxx"
        ></video>
    `;
}
