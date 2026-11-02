# ReLife Online browser-side auditing foundation.
relife_audit <- function(events = data.frame()) {
  list(timestamp = as.character(Sys.time()), event_count = NROW(events))
}
