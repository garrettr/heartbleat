# heartbleat

Detect if the user is making a request to a site that is vulnerable to
Heartbleed. We can probably do this in several ways - the easiest would be to
ping one of the existing test services (e.g. ), and maybe keep a decisions
cache. Then we can either block or warn the user. I advocate for blocking the
request before it's made. We will need a UI (panel icon) to specify when
something is blocked and allow the user to un-block specific sites so they can
get to a site that they really have to use.

Optional features:

1. Find some way to report the site (dedicated Twitter account) or provide
   a feedback form to encourage sites to fix their shit
2. Clear or don't send cookies to prevent them being stolen by attackers. Best
   thing to do is total block though (if clearing cookies prompts the user to
   log in, that exposes their password which is potentially even worse since it
   might be reused).
