
[Figma](https://www.figma.com/design/cRzgtNDZ6qA9iBoHebqWu7/Obsidian-Tasks-Timeline?node-id=0-1&p=f&t=3OQZoUgSG8Yn0XfZ-0)
- - -
## Timeline View
#### Design 
- [Tasks-Timeline](https://github.com/702573N/Obsidian-Tasks-Timeline)
- [Checklist](https://github.com/delashum/obsidian-checklist-plugin)
- Each day is a header, with items listed under each day
- Fields such as due date, start time, end time, etc. are shown in subtitle under the corresponding item
- Automatically opens to the current day's header, scrolling away from that header reveals a "Jump to Today" button

#### User Stories
- User can access their Timeline data in plain text through a specified file (default `Timeline.md`)
- User can add two kinds of items, check boxes and bullet points
- User can add sub-items to items
- User can add fields, such as [due::  date], [start::  time], [end::  time]  to items, stored as inline metadata in `Timeline.md`
- User can reassign items by dragging and dropping item from one day to another
- User can assign items to through a right click context menu
- User can select and interact with multiple items
- User can search for items

## Unsorted Items View
#### Design
- Similar to Timeline View, but groups can be scrolled through horizontally

#### User Stories
- User can create groups for unsorted items (e.g. "School", "Linux", "Home")
- User can assign tasks to a day by dragging and dropping unsorted items onto days in the Timeline View 

## Weekly View
#### Design
- Design would be like the Timeline View but stacked horizontally
![Timeline](https://images.creativemarket.com/0.1.0/ps/6785134/3509/2478/m1/fpnw/wm0/weekly-plan-and-notes-cover-.jpg?1565120024&s=eaf4d5c31a606f7375a628b53dbfecb9)
- Automatically opens centered on current date
- Continuous and scroll-able

#### User Stories


## Calendar View
#### Design
- [Reference](https://madebyevan.com/calendar/app/)
- Automatically opens centered on current date
- Continuous and scroll-able

#### User Stories
- User can toggle an option to only display items with certain fields (such as [due::  date], [start::  time], [end::  time])

## Miscellaneous User Stories
- User can reassign items by dragging and dropping them between views (e.g., dragging an item from the Timeline view to the Calendar view)
