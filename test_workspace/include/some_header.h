// Used to test 'cmantic.createMatchingSourceFile'

#ifndef SOME_HEADER_H
#define SOME_HEADER_H

#include "derived.h"


namespace these {
    namespace scopes {
        namespace are {
            namespace heavily {
                long long anIncrediblyLongAndUnnecessarilyDrawnOutFunctionName(long long someLongParameterNameIDontKnowWhoCares);
            }

            namespace nested {
                class SomeObject
                {
                public:
                    SomeObject(int some_int);
                    ~SomeObject();

                    bool fooBar() const;

                private:
                    Derived m_derived;
                };
            }
        }
    }

    namespace foo {
        namespace bar {

        }

        namespace baz {

        }
    }
}

#endif // SOME_HEADER_H
