# Hostile notes

Plain [web](https://example.com/ok) and [mail](mailto:a@example.com) links stay.

- [one](javascript:parent.__mdXss=1)
- [two](JaVaScRiPt:parent.__mdXss=2)
- [three](vbscript:msgbox)
- [four](data:text/html;base64,PHNjcmlwdD5wYXJlbnQuX19tZFhzcz00PC9zY3JpcHQ+)
- [five](javascript&#58;parent.__mdXss=5)
- <img src=x onerror="parent.__mdXss=6"> <svg onload="parent.__mdXss=7">

![pic](javascript:parent.__mdXss=8)
- [six](javascript:parent.__mdXss=9)
- [seven]( javascript:parent.__mdXss=10)
